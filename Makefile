
run:
	NODE_PATH=.:../tabulator-firefox/content/js/rdf/dist/ node server.js \
		-v --uriBase http://localhost:3000/test/ --fileBase `pwd`/test/



