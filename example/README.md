# Emery Spinner Example Project

An example Emery Spinner project that attempts to show and explain the most of the ES features and options. As of itself, it is a simplistic non-interactive program that prints some generated images
and text in several languages - which may not look complicated or even impressive, until you check the way it is written...

Usage:
1. Copy the example folder (that is, literally, the current `example` folder) to a test location and go to it.
2. `npm install`
3. `node_modules\.bin\emery-spinner es-project.js` (or, under lunix, `node_modules/.bin/emery-spinner es-project.js`) to assemble debug version - `es-project-dbg.gen.html`
4. `node_modules\.bin\emery-spinner es-project.js --build-release` to assemble release version - `es-project.gen.html`

Both debug and release version can be open in the browser as local files (the debug depends on the source files, the release is self-contained).

Note that file `txt.es-gen.js`, which normally is subject to generation and alteration by ES along with other `.es-gen.js` files, is also included as part of example, as it contains some pre-entered
localized string values. This shows with better emphasis the major design goal of ES: possibility of persistent manual/external edits on the generated resource files that can be leveraged by the resource
pipeline design.
