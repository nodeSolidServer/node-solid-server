
T=http://localhost:3000/test
W=/devel/WWW
S=$W/2000/10/swap
C=python $S/cwm.py --quiet
D=python $S/cant.py

all:  put1 put2  post1 post2 post2n post3 post4 post5

clean :
	rm *result*  *headers.txt *.nt

put1 :
	curl --upload-file put-input.txt $T/put-result.txt
	diff put-input.txt put-result.txt
	
put2 :
	curl --upload-file put-input-2.html $T/put-result-2.html
	diff put-input-2.html put-result-2.html

#   try an empty patch file -- nothing should change
post1:
	cp patch-1-initial.ttl post-1-result.ttl
	curl -HContent-type:application/sparql-update --data-binary @empty.spatch  $T/post-1-result.ttl
	# diff post-1-result.ttl patch-1-initial.ttl
	$C --n3 --ntriples < post-1-result.ttl > post-1-result.nt
	$C --n3 --ntriples < patch-1-initial.ttl > patch-1-final.nt
	$D --from=patch-1-final.nt --diff=post-1-result.nt


#patch2:
#	cp patch-2-initial.ttl patch-2-result.ttl
#	curl --request PATCH -HContent-type:application/sparql-update --data-binary @patch-2.spatch  $T/patch-2-result.ttl
#	diff patch-2-final.ttl patch-2-result.ttl

post2n:   # Negative test
	cp patch-2-initial.ttl post-2n-result.ttl
	curl --request POST -HContent-type:application/sparql-update --data-binary @patch-2n.spatch \
	  --dump-header post-2n-headers.txt  $T/post-2n-result.ttl
	# diff patch-2-final.ttl post-2-result.ttl
	$C --n3 --ntriples < post-2n-result.ttl > post-2n-result.nt
	$C --n3 --ntriples < patch-2-initial.ttl > patch-2n-final.nt # unchanged!
	$D --from=patch-2n-final.nt --diff=post-2n-result.nt
	grep 409 post-2n-headers.txt 

post2:
	cp patch-2-initial.ttl post-2-result.ttl
	curl --request POST -HContent-type:application/sparql-update --data-binary @patch-2.spatch \
	  --dump-header post-2-headers.txt  $T/post-2-result.ttl
	# diff patch-2-final.ttl post-2-result.ttl
	$C --n3 --ntriples < post-2-result.ttl > post-2-result.nt
	$C --n3 --ntriples < patch-2-final.ttl > patch-2-final.nt
	$D --from=patch-2-final.nt --diff=post-2-result.nt


################### LDPATCH example

post3:
	cp ldpatch-example-initial.ttl post-3-result.ttl
	curl -HContent-type:application/sparql-update --data-binary @ldpatch-example-patch-1.spatch \
		--dump-header post-3-headers.txt  $T/post-3-result.ttl
	# patch-3-final.ttl post-3-result.ttl
	$C --n3 --ntriples < post-3-result.ttl > post-3-result.nt
	$C --n3 --ntriples < patch-3-final.ttl > patch-3-final.nt
	$D --from=patch-3-final.nt --diff=post-3-result.nt

post4:
	cp ldpatch-example-initial.ttl post-4-result.ttl
	curl -HContent-type:application/sparql-update --data-binary @ldpatch-example-patch-2.spatch  \
		--dump-header post-4-headers.txt $T/post-4-result.ttl
	# diff patch-4-final.ttl post-4-result.ttl
	$C --n3 --ntriples < post-4-result.ttl > post-4-result.nt
	$C --n3 --ntriples < patch-4-final.ttl > patch-4-final.nt
	$D --from=patch-4-final.nt --diff=post-4-result.nt

	
#######   DELETE DATA

post5:
	cp patch-5-initial.ttl post-5-result.ttl
	curl -HContent-type:application/sparql-update --data-binary @patch-5.spatch  \
		--dump-header post-5-headers.txt $T/post-5-result.ttl
	# diff patch-4-final.ttl post-4-result.ttl
	$C --n3 --ntriples < post-5-result.ttl > post-5-result.nt
	$C --n3 --ntriples < patch-5-final.ttl > patch-5-final.nt
	$D --from=patch-5-final.nt --diff=post-5-result.nt


