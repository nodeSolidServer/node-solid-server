

# see also JSON validator  http://jsonformatter.curiousconcept.com

run-for-test:
	NODE_PATH=.:../tabulator-firefox/content/js/rdf/dist/ node server.js \
			  -v --uriBase http://localhost:3000/test/ -p 3000 --fileBase `pwd`/test/




