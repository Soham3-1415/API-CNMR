const got = require("got");
const express = require("express");
const bodyParser = require("body-parser");
const convertToJcamp = require("convert-to-jcamp");
const app = express();
const PORT = parseInt(process.env.PORT,10) || 3000;
app.use(bodyParser.json());
app.post('/mol2DInput', (req, res) => {
	let mol = req.body.mol;
	let molPromise = got.post('https://www.chemspider.com/InChI.asmx/MolToInChIKey',
		{
			headers:{"Content-Type":"application/x-www-form-urlencoded"},
			body:`mol=${mol}`
		}
		).then(res => {
			let inChIKey = res.body.match(/[A-Z]{14}-[A-Z]{10}-[A-Z]/g)[0];
			return got.get(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/inchikey/${inChIKey}/SDF?record_type=3d`
			).then(res => {
				return res.body;
			}).catch(error => {console.log(error.response.body);return ""});
		}).catch(error =>  {console.log(error.response.body);return "";});
	let jcampPromise = got.post('https://script.epfl.ch/script/Service/20140827/6klsXZb3NS',
		{
			headers:{"Content-Type":"application/x-www-form-urlencoded"},
			body:`molfile=${mol}`
		}
		).then(res => {
			return res.body;
		}).catch(error => {console.log(error.response.body);return "";});
	Promise.all([molPromise,jcampPromise]).then(result => {
		res.status(200).send({
			mol:result[0],
			jcamp:result[1]
		});
	});
});
app.listen(PORT, () => {
	console.log(`server running on port ${PORT}`)
});