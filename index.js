const request = require("request");
const app = require("express")();

app.post('/mol2DInput', (req, res) => {
	let mol = req.params.mol;

	/*request.get('https://www.chemspider.com/InChI.asmx/MolToInChIKey', (error, response, body) => {
		let json = JSON.parse(body);
		console.log(body);
	});

	const inChIKey = 'https://www.chemspider.com/InChI.asmx/MolToInChIKey' (method:'POST',body:`mol=${mol}`);*/
	res.status(200).send({
		req:mol,
		mol:"",
		jcamp:""
	})
});

const PORT = 3000;
   
app.listen(PORT, () => {
	console.log(`server running on port ${PORT}`)
});

//const inChIKey = 'https://www.chemspider.com/InChI.asmx/MolToInChIKey' (method:'POST',body:`mol=${mol}`);
//const mol3D = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/inchikey/${inChIKey}/SDF?record_type=3d`;
//const jcampJSON = 'https://script.epfl.ch/script/Service/20140827/6klsXZb3NS' (method:'POST',body:`molfile=${mol}`);