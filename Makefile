# see also JSON validator  http://jsonformatter.curiousconcept.com for the package.json file

run-for-test:
	node bin/ldnode.js -p 3456 -v --uri http://localhost:3456/test/ --root `pwd`/test/

run-for-test-login:
	node bin/ldnode.js -p 3456 -v --webid --uri https://localhost:3456/test/ --root `pwd`/test/

run-for-live-test:
	NODE_PATH=.:../tabulator-firefox/content/js/rdf/dist/ node server.js \
		p 3456 -v --live --uri http://localhost:3456/test/ --root `pwd`/test/

run-for-test-special:
	NODE_PATH=.:../tabulator-firefox/content/js/rdf/dist/ node server.js \
		-p 3456 -v --uri http://localhost:3456/test/ --root `pwd`/test/

# use --debug to run or --debug-brk to break immediately
run-for-test-special-debug:
	NODE_PATH=.:../tabulator-firefox/content/js/rdf/dist/ node --debug-brk server.js \
		-p 3456 -v --uri http://localhost:3456/test/ --root `pwd`/test/
	# Then run node-inspector and open Chrome as it suggests
	# (If necessary, npm install -g node-inspector)

test-all : 
	(make run-for-test-special) &
	sleep 5
	(cd test; make all);
	make shutdown

shutdown :
	kill `ps aux | grep 3456 | grep -v grep | awk '{print $2}'`
