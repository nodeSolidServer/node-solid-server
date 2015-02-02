

# see also JSON validator  http://jsonformatter.curiousconcept.com for the package.json file

run-for-live-test:
	NODE_PATH=.:../tabulator-firefox/content/js/rdf/dist/ node server.js \
		p 3456 -v --live --uriBase http://localhost:3456/test/ --fileBase `pwd`/test/

run-for-test:
	NODE_PATH=.:../tabulator-firefox/content/js/rdf/dist/ node server.js \
		-p 3456 -v --uriBase http://localhost:3456/test/ --fileBase `pwd`/test/




