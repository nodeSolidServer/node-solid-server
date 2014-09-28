
T=http://localhost:3000/test

put :
	curl --upload-file put-input.txt $T/put-result.txt
	diff put-input.txt put-result.txt
put2 :
	curl --upload-file put-input-2.html $T/put-result-2.html
	diff put-input-2.html put-result-2.html

post1:
	cp patch-initial-1.ttl patch-initial-1-target.ttl
	curl -HContent-type:application/sparql-update --data-binary @empty.spatch  $T/patch-initial-1-target.ttl
	diff patch-initial-1-target.ttl patch-initial-1.ttl

