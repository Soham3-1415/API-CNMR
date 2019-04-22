//Dependenices
const got = require('got');
const express = require('express');
const bodyParser = require('body-parser');
const parseXMLString = require('xml2js').parseString;

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
app.post('/mol2DInput',(req,res) => {
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

	//SMILES lookup
	const smilesPromise = got.post('https://www.chemspider.com/InChI.asmx/MolToInChI',{
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
		})
		.then(result => {
			const inChI = result.string._;
			return got.get(`https://www.chemspider.com/InChI.asmx/InChIToSMILES?inchi=${encodeURIComponent(inChI)}`);
		})
		.catch(error => {
			//Do not warn client about internal issues
			console.log('InChI to SMILES Resolution Error');
		})
		.then(result => parseXML(result.body))
		.catch(error => {
			//Do not warn client about internal issues
			console.log('SMILES XML Parse Error');
		});

	//Get raw molecule data. Needs to be scraped
	const molecule3DRawPromise = smilesPromise.then(result => {
		//Unfortunately no HTTPS access to this endpoint
		return got.get(`http://pccdb.org/tools/view_mol_from_smiles/${encodeURIComponent(result.string._)}`);
	})
		.catch(error => {
			//Do not warn client about internal issues
			console.log('3D Mol Page Retrieval Error');
		});

	//Get molecule name
	const namePromise = smilesPromise.then(result => {
		return got.get(`https://cactus.nci.nih.gov/chemical/structure/${encodeURIComponent(result.string._)}/iupac_name`);
	})
		.catch(error => {
			//Do not warn client about internal issues
			console.log('Name Retrieval Error');
		});

	//Get JCAMP data
	const jcampPromise = got.post('https://script.epfl.ch/script/Service/20140827/6klsXZb3NS', {
		headers:{'Content-Type':'application/x-www-form-urlencoded'},
		body:`molfile=${molecule2D}`
	})
		.catch(error => {
			//Do not warn client about internal issues
			console.log('JCAMP Retrieval Error');
		});

	//Send data after all Promises resolve
	Promise.all([
		molecule3DRawPromise,
		namePromise,
		jcampPromise
	])
		.then(result => {
			//This is bad
			let extractedMol = result[0].body
				.match(/\$\("#show_coords_3d_MOL"\)\.text\('smiles:.*'\+'\$\$\$\$'\);/g)[0]
				.substring('$("#show_coords_3d_MOL").text(\'smiles:'.length+1);
			extractedMol = extractedMol.substring(0,extractedMol.indexOf('END')+'END'.length)
				.replace(/\\n/g, '\n')
				.replace(/^\s+/g, '');
			sendSolved(
				res,
				extractedMol,
				result[1].body,
				JSON.parse(result[2].body).result.spectrum13C
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