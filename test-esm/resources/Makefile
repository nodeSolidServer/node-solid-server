# Run tests on node server
#
# First do    make run-for-test
# in parent directory.

T=http://localhost:3456/test
W=/devel/WWW
S=$W/2000/10/swap
C=python $S/cwm.py --quiet
D=python $S/cant.py

all:  get-1 put-1 put-2  post-1 post-2 post-2n post-3 post-4 post-5 delete-1

clean :
	rm *result*  *headers.txt *.nt || echo Never mind

ws-1 :
	curl -v -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" \
	-H "Host: localhost:3333" -H "Origin: http://localhost:3333" $T/patch-1-initial.ttl,changes
get-1 :
	curl --dump-header get-1-headers.txt $T/patch-1-initial.ttl > get-1-result.ttl
	diff patch-1-initial.ttl get-1-result.ttl
	# grep -i updates-via get-1-headers.txt

put-1 :
	curl --upload-file put-input.txt $T/put-result.txt
	diff put-input.txt put-result.txt

put-2 :
	curl --upload-file put-input-2.html $T/put-result-2.html
	diff put-input-2.html put-result-2.html

#   try an empty patch file -- nothing should change
post-1:
	cp patch-1-initial.ttl post-1-result.ttl
	curl -HContent-type:application/sparql-update --data-binary @empty.spatch  $T/post-1-result.ttl
	# diff post-1-result.ttl patch-1-initial.ttl
	$C --n3 --ntriples < post-1-result.ttl > post-1-result.nt
	$C --n3 --ntriples < patch-1-initial.ttl > patch-1-final.nt
	$D --from=patch-1-final.nt --diff=post-1-result.nt


#patch-2:
#	cp patch-2-initial.ttl patch-2-result.ttl
#	curl --request PATCH -HContent-type:application/sparql-update --data-binary @patch-2.spatch  $T/patch-2-result.ttl
#	diff patch-2-final.ttl patch-2-result.ttl

post-2n:   # Negative test
	cp patch-2-initial.ttl post-2n-result.ttl
	curl --request POST -HContent-type:application/sparql-update --data-binary @patch-2n.spatch \
	  --dump-header post-2n-headers.txt  $T/post-2n-result.ttl
	# diff patch-2-final.ttl post-2-result.ttl
	$C --n3 --ntriples < post-2n-result.ttl > post-2n-result.nt
	$C --n3 --ntriples < patch-2-initial.ttl > patch-2n-final.nt # unchanged!
	$D --from=patch-2n-final.nt --diff=post-2n-result.nt
	grep 409 post-2n-headers.txt 

post-2:
	cp patch-2-initial.ttl post-2-result.ttl
	curl --request POST -HContent-type:application/sparql-update --data-binary @patch-2.spatch \
	  --dump-header post-2-headers.txt  $T/post-2-result.ttl
	# diff patch-2-final.ttl post-2-result.ttl
	$C --n3 --ntriples < post-2-result.ttl > post-2-result.nt
	$C --n3 --ntriples < patch-2-final.ttl > patch-2-final.nt
	$D --from=patch-2-final.nt --diff=post-2-result.nt


################### LDPATCH example

post-3:
	cp ldpatch-example-initial.ttl post-3-result.ttl
	curl -HContent-type:application/sparql-update --data-binary @ldpatch-example-patch-1.spatch \
		--dump-header post-3-headers.txt  $T/post-3-result.ttl
	# patch-3-final.ttl post-3-result.ttl
	$C --n3 --ntriples < post-3-result.ttl > post-3-result.nt
	$C --n3 --ntriples < patch-3-final.ttl > patch-3-final.nt
	$D --from=patch-3-final.nt --diff=post-3-result.nt

post-4:
	cp ldpatch-example-initial.ttl post-4-result.ttl
	curl -HContent-type:application/sparql-update --data-binary @ldpatch-example-patch-2.spatch  \
		--dump-header post-4-headers.txt $T/post-4-result.ttl
	# diff patch-4-final.ttl post-4-result.ttl
	$C --n3 --ntriples < post-4-result.ttl > post-4-result.nt
	$C --n3 --ntriples < patch-4-final.ttl > patch-4-final.nt
	$D --from=patch-4-final.nt --diff=post-4-result.nt


#######   "DELETE DATA" in patch

post-5:
	cp patch-5-initial.ttl post-5-result.ttl
	curl -HContent-type:application/sparql-update --data-binary @patch-5.spatch  \
		--dump-header post-5-headers.txt $T/post-5-result.ttl
	# diff patch-4-final.ttl post-4-result.ttl
	$C --n3 --ntriples < post-5-result.ttl > post-5-result.nt
	$C --n3 --ntriples < patch-5-final.ttl > patch-5-final.nt
	$D --from=patch-5-final.nt --diff=post-5-result.nt

###### DELETE method

delete-1:
	cp patch-5-initial.ttl del-1-result.ttl
	curl --request DELETE \
		--dump-header del-1-headers.txt $T/del-1-result.ttl
	echo Ignore_this_file > del-1-result.txt

#### Link-following Sparql


lfs-0:
	curl http://www.w3.org/2015/02/lf-sparql/example1/q0.sparql > lfs-0.sparql 
	curl http://www.w3.org/2015/02/lf-sparql/example1/alice > lfs-1-target.ttl
	curl -HContent-type:application/sparql --data-binary @lfs-0.sparql  \
		--dump-header lfs-1-headers.txt $T/lfs-1-target.ttl > lfs-0-result.json
	diff lfs-0-result.json lfs-0-final.json 

lfs-1:
	curl http://www.w3.org/2015/02/lf-sparql/example1/q1.sparql > lfs-1.sparql 
	curl http://www.w3.org/2015/02/lf-sparql/example1/alice > lfs-1-target.ttl
	curl -HContent-type:application/sparql --data-binary @lfs-1.sparql  \
		--dump-header lfs-1-headers.txt $T/lfs-1-target.ttl > lfs-1-result.json
	diff lfs-1-result.json lfs-1-final.json 

######### Live update

live-2:
	./live-2.bash
	mv live-2-result.n3 live-2-saved-result.n3
	$C live-2-saved-result.n3 --no
	grep insert live-2-saved-result.n3
	grep logged live-2-saved-result.n3
	
#	curl http://localhost:3456/test/post-1-result.ttl,changes > live-2-result.n3 &
#	cp patch-2-initial.ttl post-2-result.ttl
#	curl --request POST -HContent-type:application/sparql-update --data-binary @patch-2.spatch \
#	  --dump-header post-2-headers.txt  $T/post-2-result.ttl
#	$C --n3 --ntriples < post-2-result.ttl > post-2-result.nt
#	$C --n3 --ntriples < patch-2-final.ttl > patch-2-final.nt
#	$D --from=patch-2-final.nt --diff=post-2-result.nt
#	sleep 1
#	mv live-2-result.n3 live-2-saved-result.n3
#	$C live-2-saved-result.n3 --no


	
