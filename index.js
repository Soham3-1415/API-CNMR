const got = require("got");
const express = require("express");
const bodyParser = require("body-parser");
const app = express();
const PORT = parseInt(process.env.PORT,10) || 3000;
app.use(bodyParser.json());
app.post('/mol2DInput', (req, res) => {
	const mol = req.body.mol;
	const molPromise = got.post('https://www.chemspider.com/InChI.asmx/MolToInChIKey',
		{
			headers:{"Content-Type":"application/x-www-form-urlencoded"},
			body:`mol=${mol}`
		});
	const sdfPromise = molPromise.then(res => {
			const inChIKey = res.body.match(/[A-Z]{14}-[A-Z]{10}-[A-Z]/g)[0];
			return got.get(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/inchikey/${inChIKey}/SDF?record_type=3d`
			).then(res => {
				const lines = res.body.match(/[^\r\n]+/g);
				let stop = false;
				const extracted = lines.filter((line,i) => {
					if(line.match(/^M\s+END$/g)) {
						stop = true;
						return true;
					}
					return !stop;
				});
				return extracted.join('\n');
			}).catch(error => {console.log(error);return error;});
		}).catch(error =>  {console.log(error);return error;});
	const iupacPromise = molPromise.then(res => {
		const inChIKey = res.body.match(/[A-Z]{14}-[A-Z]{10}-[A-Z]/g)[0];
		return got.get(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/inchikey/${inChIKey}/JSON`
		).then(res => {
			const props = JSON.parse(res.body).PC_Compounds[0].props;
			for(let i = 0; i < props.length; i++) {
				if(props[i].urn.label==='IUPAC Name' && props[i].urn.name === 'Preferred')
					return props[i].value.sval;
			}
			return '';
		}).catch(error => {console.log(error.response.body);return ""});
	}).catch(error =>  {console.log(error.response.body);return "";});
	const jcampPromise = got.post('https://script.epfl.ch/script/Service/20140827/6klsXZb3NS',
		{
			headers:{"Content-Type":"application/x-www-form-urlencoded"},
			body:`molfile=${mol}`
		}
		).then(res => {
			return JSON.parse(res.body).result.spectrum13C;
		}).catch(error => {console.log(error.response.body);return "";});
	Promise.all([sdfPromise,iupacPromise,jcampPromise]).then(result => {
		res.status(200).send({
			mol:result[0],
			name:result[1],
			jcamp:result[2]
		});
	});
});
app.listen(PORT, () => {
	console.log(`server running on port ${PORT}`)
});