.PHONY: build test install clean

build:
	npm run build

test:
	npm test

install: build
	npm install -g .

clean:
	rm -rf dist
