//Dependenices
const got = require('got');
const express = require('express');
const bodyParser = require('body-parser');
const parseXMLString = require('xml2js').parseString;
const version = 'v2';
const endpoint = '/api/' + version;

//Initial var setup
const PORT = parseInt(process.env.PORT,10) || 3000;
const app = express();

//Middleware
app.use(bodyParser.json());
app.use((err,req,res,next) => {
	if(err) {
		console.log('Invalid Request Data');
		res.send({error:'Invalid Request Data'});
	}
	else {
		next();
	}
});

//Send molecule 3D conformer file, name, and annotated spectral data
const sendSolved = (res,molecule3D,moleculeName,jcampData) => {
	res.status(200).send({
		mol:molecule3D,
		name:moleculeName,
		jcamp:jcampData
	});
};

//Request Handling
app.post(endpoint + '/mol2DInput',(req,res) => {
	//Store error messages to be sent back to client
	const errorMessage = [];

	//store molfile from input
	const molecule2D = req.body.mol;

	// Parse XML
	const parseXML = (xml) => {
		return new Promise((resolve, reject) => {
			parseXMLString(xml, (err, result) => err ? reject(err) : resolve(result) );
		});
	};

	//InChI lookup
	const inChIPromise = got.post('https://www.chemspider.com/InChI.asmx/MolToInChI',{
		headers:{'Content-Type':'application/x-www-form-urlencoded'},
		body:`mol=${molecule2D}`
	})
		.catch(error => {
			console.log('Mol to InChI Resolution Error');
			errorMessage.push('Mol Resolution Error');
		})
		.then(result => parseXML(result.body))
		.catch(error => {
			//Do not warn client about internal issues
			console.log('InChI XML Parse Error');
		});

	//Get SDF
	const sdfPromise = inChIPromise.then(result => {
		return got.get(`https://cactus.nci.nih.gov/chemical/structure/${result.string._}/sdf`);
	})
		.catch(error => {
			//Do not warn client about internal issues
			console.log('SDF Retrieval Error');
			return {body:'SDF UNKNOWN'};
		});

	//Get molecule name
	const namePromise =  inChIPromise.then(result => {
		return got.get(`https://cactus.nci.nih.gov/chemical/structure/${result.string._}/iupac_name`);
	})
		.catch(error => {
			//Do not warn client about internal issues
			console.log('Name Retrieval Error');
			return {body:'NAME UNKNOWN'};
		});

	//Get JCAMP data
	const jcampPromise = got.post('https://script.epfl.ch/script/Service/20140827/6klsXZb3NS', {
		headers:{'Content-Type':'application/x-www-form-urlencoded'},
		body:`molfile=${molecule2D}`
	})
		.catch(error => {
			//Do not warn client about internal issues
			console.log('JCAMP Retrieval Error');
			return {body:'{"result":{"spectrum13C":"JCAMP UNKNOWN"}}'};
		});

	//Send data after all Promises resolve
	Promise.all([
		sdfPromise,
		namePromise,
		jcampPromise
	])
		.then(result => {
			sendSolved(
				res,
				result[0].body,
				result[1].body,
				annotateJCAMP(JSON.parse(result[2].body).result)
			);
		})
		.catch(error => {
			if(errorMessage.length === 0)
				res.send({error:'Unknown Error'});
			else if(errorMessage.length === 1)
				res.send({error:errorMessage[0]});
			else
				res.send({error:errorMessage});
		});
});

//Start server and listen on PORT
app.listen(PORT, () => {
	console.log(`server running on port ${PORT}`)
});

//Returns false for whitespace or empty strings
const removeBlank = element => !element.match(/^\s*$/g);

//Returns annotated JCAMP Data given a JSON from nmrdb.org
const annotateJCAMP = (data) => {
	//Number of decimal places to move decimal for the raster section (only takes ints)
	const rasterMultiplier = 2;

	//Section headers
	let atomList = '##ATOMLIST=\n' + '$$ AN AS\n';
	let bondList = '##BONDLIST=\n' + '$$ AN1 AN2 BT\n';
	let rasterList = '##XY_RASTER=\n' + '$$ AN X Y\n';
	let peakAssignments = '##PEAK ASSIGNMENTS=(XYA)\n';
	let peakTable = '##PEAK TABLE=(XY..XY)\n';

	//Read molfile and split in to lines
	const mol = data.molfile.split(/\n/g);

	//Parse counts line in molfile
	const counts = mol[3].split(/\s+/g).filter(element => removeBlank(element));

	//Record number of atom section and bond section lines
	const atomCount = parseInt(counts[0]);
	const bondCount = parseInt(counts[1]);

	//Create Atom section and Raster section
	for (let i = 0; i < atomCount; i++) {
		//Parse atom line
		const atom = mol[4 + i].split(/\s+/g).filter(element => removeBlank(element));
		//Create atom section
		atomList += `${i + 1} ${atom[3]}\n`;
		//Create raster section and increase raster precision before floats are truncated
		rasterList += `${i + 1} ${(parseFloat(atom[0])*Math.pow(10,rasterMultiplier)).toFixed(0)} ${-1*(parseFloat(atom[1])*Math.pow(10,rasterMultiplier)).toFixed(0)}\n`;
	}

	//Create bond section
	for (let i = 0; i < bondCount; i++) {
		//Parse bond line
		const bond = mol[4 + atomCount + i].split(/\s+/g).filter(element => removeBlank(element));
		//Create bond section
		bondList += `${bond[0]} ${bond[1]} ${bond[2] === '1' ? 'S' : bond[2] === '2' ? 'D' : 'T'}\n`;
	}

	const peaks = []; //Store peak location and atom
	const peakCounts = new Map(); //Store peak location (unique only) and frequency
	let peakCountMax = 1; //Highest peak frequency
	//Tally peak frequencies and fill peaks
	data.spectrum13C.annotations.forEach(peak => {
		const peakPosition = peak.label.position.x; //Store peak position in a variable

		//Tally peak frequencies
		if (peakCounts.has(peakPosition)) {
			const peakCount = peakCounts.get(peakPosition) + 1;
			peakCounts.set(peakPosition, peakCount);
			if (peakCount > peakCountMax)
				peakCountMax = peakCount;
		}
		else
			peakCounts.set(peakPosition,1);

		//Fill peaks
		peaks.push([peakPosition, peak.info.atomIDs[0]]);
	});

	//Create peak table section and peak assignments section
	peaks.forEach(peak => {
		const peakHeight = peakCounts.get(peak[0])/peakCountMax;
		peakAssignments += `(${peak[0]},${peakHeight.toFixed(2)},<${parseInt(peak[1])+1}>)\n`;
		peakTable += `${peak[0]},${peakHeight.toFixed(2)}\n`;
	});

	//Returned combined data to form annotated JCAMP
	return atomList + bondList + rasterList + peakAssignments + peakTable + data.spectrum13C.jcamp.value;
};
