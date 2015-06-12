# see also JSON validator  http://jsonformatter.curiousconcept.com for the package.json file

run-for-test:
	node server.js -p 3456 -v --uriBase http://localhost:3456/test/ --fileBase `pwd`/test/

run-for-test-login:
	node server.js -p 3456 -v --webid --uriBase http://localhost:3456/test/ --fileBase `pwd`/test/

run-for-live-test:
	NODE_PATH=.:../tabulator-firefox/content/js/rdf/dist/ node server.js \
		p 3456 -v --live --uriBase http://localhost:3456/test/ --fileBase `pwd`/test/

run-for-test-special:
	NODE_PATH=.:../tabulator-firefox/content/js/rdf/dist/ node server.js \
		-p 3456 -v --uriBase http://localhost:3456/test/ --fileBase `pwd`/test/

# use --debug to run or --debug-brk to break immediately
run-for-test-special-debug:
	NODE_PATH=.:../tabulator-firefox/content/js/rdf/dist/ node --debug-brk server.js \
		-p 3456 -v --uriBase http://localhost:3456/test/ --fileBase `pwd`/test/
	# Then run node-inspector and open Chrome as it suggests
	# (If necessary, npm install -g node-inspector)

test-all : 
	(make run-for-test-special) &
	sleep 5
	(cd test; make all);
	make shutdown
	
shutdown :
	kill `ps aux | grep 3456 | grep -v grep | awk '{print $2}'`
