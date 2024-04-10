# emery-spinner
A small scale JS/HTML bundler and runtime library, aimed at bunding simple, self-contained, single-page HTML5 applications and compiling resources for JS comprehension.

It can be roughly considered a wheel-invented counterpart to webpack, parcel etc. However, Emery Spinner offers a different goal setting and a different take on the problem:

Goal 0. Application locality. You don't need to run any "local" or whatever other web server during development or runtime, and you are not supposed to. Neither is the end user of your application -
they should be able to run it by just opening the single HTML file ("release") from whatever location, online or offline.

Application locality nowdays is discouraged and actively hampered by the web technology mainstream under untenable "security" justifications, so it is quite a challenge to just take your notepad and sketch
a simple program that does a thing using some resources under HTML5 environment, with no dependencies, prerequisites, or mandatory online. The primary goal of Emery Spinner is to (re)introduce simplicity to
developing local programs to the extent possible under contemporary web tech consensus.

Goal 1. Javascript centered development. HTML5 is typically treated a front-end facing endpoint than an operating environment of its own, so most libraries and frameworks promote writing declarative-reactive-no-code-something
in variety of HTMLish/CSSish/etc-ish DSLs. Emery Spinner assumes more "JS oriented" programming, where the most actions and logic and data live inside JS code and are comprehended in JS terms. Developers
are not forced to think outside JS, unless they want.

Goal 2. Javascript comprehension of resources. As a logical implication of the goal 1, the resources, whatever they are (images and media, other types of data...) are to be exposed to the program in a JS
comprehensible way. For example, an image file `a.png` might be accessible like this:
```js
var aPng = R$["#PNG@/a.png"];
console.log("a.png dimensions:", aPng.width, aPng.height);
console.log("a.png pixels:", aPng.pixels);
// the R$["#PNG@/a.png"] object will be compiled into the program automatically and transparently
// as soon as "#PNG@/a.png" string occurs in the code
```
Emery Spinner contains no built-in magic for this specific (as well as any other) resource preparation - it is up to the developer to write a _tool_ that compiles the resource to JS structure most appropriate
for the program. But it isn't as bad as it might sound. Programming of resource building tools is an important part of Emery Spinner pipeline, so great care is taken that it was as easy, express and integrated
as possible. Naturally, the tools are also JS based (node.js environment).

# An express introduction

The very first item in Emery Spinner project is *project root directory (folder)* - the one under which files, sources and artifacts of your program's project will live. Let's create one and refer to it,
for example, as `PROJ_ROOT`. Note that in Emery Spinner the paths starting with `/`, like `/dir/file`, are considered *project root paths* and are relative to the project root (that is, `PROJ_ROOT/dir/file` in our case).

Next item is *source HTML file*. The release will be exactly a single HTML file - the source HTML is the blueprint for it, let's create one under name of `PROJ_ROOT/src.html` with the following content:
```html
<html>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8">
<!-- Note that you are not restricted to using just utf-8 charset -->
<body>
<div id="stdout"></div>
</body>
<!-- The comment below is a placeholder for the ES emitted JS code, MUST go after body -->
<!-- #emery-target -->
</html>
```
The content of the source HTML is quite arbitrary, with the single exception: there must be exactly one comment with Emery Spinner placeholder (`<!--#emery-target-->`, interim whitespaces allowed), and it must
be placed after `<body>` tag (a restriction due to how dynamic scripts are processed in HTML5).

Then we will need *project root JS file*. Its purpose is three-fold:
- it is a javascript that will be part of substitution for Emery Spinner placeholder,
- it contains specifications of the project by means of specially formatted single-line JS comments.
Let's create the project root file, named `PROJ_ROOT/src.js`, with the following content:

```js
//#charset utf-8
//^ every JS file in Emery Spinner project can (and should) specify its encoding, so that it was correctly embedded.
// People with non-latin locales and editors that like to assign non-utf8 default encodings to newly created files should immediately appreciate this convenience.

// #html
// source: /src.html,
// target: /debug.html,
// release-target: /release.html,
// default-resgroup-js: /test-prj.es-res.js

stdout.innerText = "Hello, Emery Spinner world!";
```

In this spec you can see some more concepts:
- *\[Debug\] target HTML file* (`debug.html` here) - the HTML file that you will open in the browser for debug, it has the `#emery-target` placeholder resolved, but in a debug friendly way. It refers other files
and can not work standalone (you are assumed to open it in its original location only), but the javascript sources are readable in the debugger and come with accurate source locations. Most of the time the manual
and build-induced updates will affect the file set linked to the debug target file.
- *Release target HTML file* (`release.html` here) - the release HTML file that contains all the items bundled for release, standalone and self-contained. It is only built by an explicit command.
- *Default resource group*. The *compiled resources*, as visible to your program, are basically JSON data assigned to certain magic variable (`R$`), and the generated code that assigns them is grouped into
JS files that are names *resource groups*. There is always at least one resource group, the default one - name for its file is specified here.

After you have prepared source HTML and project root file, you are ready to bootstrap a Emery Spinner project. Install Emery Spinner with the following command under `PROJ_ROOT`:
```
npm install git+https://github.com/sbtrn-devil/emery-spinner
```
(or `npm install emery-spinner` if it ever gets to NPM)

Then, preferably in a separate terminal/command line window, invoke the following command (under windows):
```
node_modules\.bin\emery-spinner src.js --spin
```

or (under lunix):
```
node_modules/.bin/emery-spinner src.js --spin
```

This way you launch Emery Spinner in continuous ("spinning") mode and bring up the console where you can type commands (for example, `help` (try it now) or `exit`). In general, you will not need to do much things here: the relevant
file changes are automatically processed, and most time you will only want to check the logs to see if the things are going straight. A build iteration that occurs after each relevant change is called a *respin*.
In general, respins can fail - in that case you will see complaints in the log, they will point at the problem and at the items you need to fix.

First products that you should get shortly after the start are several generated files (Emery Spinner tries to name then with `.es-gen.js`, unless it is a file for which you are able to specify an explicit name).
One of them is the target file `debug.html` - try opening it in the browser (you should see a page with "Hello, Emery Spinner world!" text).

Let's add some modularity and create a file `PROJ_ROOT/main.js`:

```js
//#charset utf-8

function main() {
	stdout.innerText = "Hello, Emery Spinner world (from main)!";
}
```

And in the project root file, let's do some edits:
```js
//stdout.innerText = "Hello, Emery Spinner world!"; // <-- remove this
// and replace with this (including the '#use ...' comment below!):
//#use main.js
main();
```

Refresh the `debug.html` in the browser to see the effect.
`#use` directive links a JS file into the target page (and into the Emery Spinner project), in such a way that code from the `#use`-d JS file occurs _before_ the one that `#use`-s it - therefore the
`#use`-r is able to use all its declarations and execution results. `#use` can be used in root project file and in any other JS file, so that the usage tree can be quite sprawling, and one same file
can be `#use`-d by multiple others - it will occur in the target only once at the firstmost appropriate location. (Note: avoid circular references, Emery Spinner considers it an error.)
Paths in `#use` can be project root (`/dir/file`), or relative to the directory of the `#use`-r (`dir/file`).

Now, let's add a simple resource: JSON file `PROJ_ROOT/data.json`:

```js
{
	"a": "string",
	"b": [1,2,3]
}
```

We would like to use it like this:
```js
// edit this in main.js
function main() {
	stdout.innerText = JSON.stringify(R$["#GenJson@/data.json"].data);
}
```

but it won't work right now (you should see complaints in the log), because we have not yet prepared a tool to work with this type of resource. Let's add one - file named `PROJ_ROOT/tool-gen-json.js` (it does a certain number of things,
but the comments should be explanatory enough):

```js
//#builds-res GenJson
//^this is important - it tells which resource types this tool builds
var fs = require('fs');

module.exports = {
	"GenJson": {
		// perform initialization, called once per respin; note that on each respin the tool
		// process is restarted, so effectively once per process, so it is safe here to store
		// any per-spin config/cache in globals
		// return: none, throw if any error (will prevent use of this tool in current respin)
		async init({ toolkit }) {
		},

		// return: {resId: string, group: "/path/grp", hint: any|null}
		// missing or null group = default group
		async parseResourceRef({ resRef, toolkit }) {
			var stdMatch = toolkit.parseStdResRef(resRef);
			if (!stdMatch) throw Error("Malformed #GenJson@ resource ref " + resRef);
			return { resId: stdMatch.resId, group: stdMatch.group, hint: null };
		},

		// return: [..."/file/path"|"#Res@id"]
		// may be called repeatedly
		// only the files and resources need to be here that will be accessed
		// in the rebuildResource, simple resref strings can be used without it
		async getBuildDependencies({ resId, toolkit }) {
			toolkit.logDebug("GenJson: Query deps for " + resId);
			var stdMatch = toolkit.parseStdResRef(resId);
			return [stdMatch.projectPath]; // the file (the single item in the list)
		},

		// return: true|false
		// is allowed to access dependency files/resources via toolkit
		async isResourceUpToDate({ resId, hint, target, toolkit }) {
			var stdMatch = toolkit.parseStdResRef(resId),
				path = stdMatch.projectPath,
				realPath = toolkit.getFileRealPath(path);
			toolkit.logDebug("GenJson: Check up to date " + path + " " + realPath);
			var ts = await toolkit.getFileTimestamp(path);
			return (target._ts >= ts);
		},

		// return: none
		// target is the resource body, assign to target members or read them for values
		// from prev build or manual edits
		async rebuildResource({ resId, hint, target, toolkit }) {
			var stdMatch = toolkit.parseStdResRef(resId),
				path = stdMatch.projectPath,
				ts = await toolkit.getFileTimestamp(path);
				realPath = toolkit.getFileRealPath(path),
				notes = target.notes;
			var data = JSON.parse(await fs.promises.readFile(realPath, "utf8"));
			toolkit.clearObjectProperties(target);
			target.data = data;
			if (notes) target.notes = notes;
			target._ts = ts;
		}
	}
};
```

Then, make Emery Spinner aware of this tool by adding the following into the project root file:
```js
...
//#tool /tool-gen-json.js
//<-- add it before...
//#use main.js
main();
```

Check the Emery Spinner window that errors have gone (last message is "All items ok, release and prune are possible"), and refresh the `debug.html` in the browser. You should see page with the text: `{"a":"string","b":[1,2,3]}`

Now try editing `PROJ_ROOT/data.json`, e. g. to this:

```js
{
	"hello": "world"
}
```

refresh `debug.html` and observe the text changed to `{"hello":"world"}`. Note that compilation of the `data.json` into resource JS object embedded into the page, by invoking the `tool-gen-json` you've just added, occurred automatically. That's the magic!

Now, in the Emery Spinner window, type command: `release`
It should say something like:
```
All items ok, release and prune are possible
Building release (<project-root>:/release.html)...
Release built!
```

Check that you have got a `PROJ_ROOT/release.html` file and try opening it in the browser. Looks similar to what you see from `debug.html`, doesn't it? Now, try moving the `release.html` to some entirely different location and open it from there. It still works!

Now that you have done with it, type `exit` command in the Emery Spinner to stop spinning and exit. Note that you could invoke `emery-spinner` without `--spin` argument to do the build in non-interactive mode, just like you would expect from a `make`-like tool. Also try calling
```
node_modules\.bin\emery-spinner src.js --spin
```
to see the available command-line options.

There are more sophisticated things Emery Spinner can do, just to name some:

- **Using raw JS files**. If your project involves some Emery Spinner unaware JS libraries, you can link them via `#use-raw` directive rather than `#use` to disable any Emery Spinner parsing within these files (including resource references) to prevent spurious side effects.
- **Tool configuration**. You can pass some extra configuration to tools from the project root file using `#tool-cfg` directives.
- **Resource reference vs resource ID concept**. The `"#ResType@..."` strings identified by Emery Spninner are treated as resource references rather than actual resource IDs that you will ultimately use to address a resource via `R$`. A resource reference may be exactly the same as the final resource ID, but as well may differ. Thus you can for example embed resource building hints to the tool into a resource reference, like: `"#ResType@/res/id:Fill it with defaults"`. It is up to the tool to decode resource reference into actual resource ID and whatever other data (`parseResourceRef` method). However, in the runtime code where the resource reference string is found, it is up to you to take care of its context (resource ref strings are not automatically converted to resource IDs, and it is up to you to ensure that indexes in all `R$` expressions were always correct resource IDs).
- **Resource preprocessing**. Due to node/browser environment isolation, the resources are compiled to JSON-compliant objects, and you can't have them include JS runtime or browser objects out of the box. However, Emery Spinner runtime allows to register _resource preprocessor_ code that can be transparently run when you first request a resource and to perform a custom transformation, for example to convert an object like:
```
{
	"@type": "%blob",
	"mimeType": "...",
	"base64": "..."
}
```
into a `Blob`.
- **Resource build debugging**. As your development progresses, you may need to alter some tool while you already have many resources that will be affected. By default, Emery Spinner tries to rebuild all the resources built by the tool on changes to the tool file, which may be not convenient. In this case, you can temporarily insert a `#build-test "#ResourceType@/resource ref..."` directive into your tool to limit the resources built by it to the given resource ref.

Use examples and explanations on all of these can be found in a more sophisticated example that you can find under [example folder](example).
