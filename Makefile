

# see also JSON validator  http://jsonformatter.curiousconcept.com

run-for-test:
	NODE_PATH=.:../tabulator-firefox/content/js/rdf/dist/ node bin/ldp-httpd.js \
		-v --uriBase http://localhost:3000/test/ --fileBase `pwd`/test/




