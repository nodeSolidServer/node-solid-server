test: ## run testinfra tests against the project
	docker run --rm -t \
		-v $(shell pwd):/project \
		-v /var/run/docker.sock:/var/run/docker.sock:ro \
		aveltens/docker-testinfra

lint: ## run hadolint against the Dockerfile
	docker run --rm -i hadolint/hadolint < src/Dockerfile

build: ## build the docker image
	cd src && docker build --tag nodesolidserver/node-solid-server .

inspect: build ## run a shell in the docker image
	docker run --rm -it --entrypoint sh nodesolidserver/node-solid-server

start: build ## start solid-server docker container
	docker run --rm \
		-it -d \
		-p 8443:8443 \
		-u "$(id -u):$(id -g)" \
		-v $(shell pwd)/data:/opt/solid/data \
		--name solid-server \
		nodesolidserver/node-solid-server

stop: ## stop the solid-server docker container
	docker stop solid-server

attach: ## execute a shell in the running solid-server docker container
	docker exec -it solid-server sh

.PHONY: test build inspect run attach
