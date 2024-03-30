// The ES root project file, also a JS file that will be always linked.
// There are other JS file types, we'll get to them later.
// Single lines starting with "//#" (or "// ...spaces... #"), optionally followed by parameters, is a ES directive.
// Some of them are only valid in certain files.
// Location and order of the directives in the file generally don't matter - only the file itself.

// An unnecessary directive can be commented out by putting some non-whitespace before the #, like this:
//-#debug
// (By the way, the #debug directive in project root file will enable debug level logging of ES internals,
// but not of the tools - to enable debug logging for tools, you need to add #debug's to the respective tool js files)

// Every JS file should declare a charset it uses (default one will be UTF-8), at any place in the file, but only once per file.

//#charset utf-8

// Root project file should contain #html directive that specifies names to some key files.
// There are defaults, but in this example we'll give the full form.
// A directive and its parameters can span multiline, given the line break is after the #..., or after a parameter separating comma, or inside '[...]'.

// #html
// source: /es-project-src.html,
// target: /es-project-dbg.gen.html,
// release-target: /es-project.gen.html,
// links-js: /es-project-links.gen.js,
// default-resgroup-js: /es-project-res.gen.js
// (When commenting out a multiline directive, only place non-whitespace in its starting line before the '#' - ES will not treat such lines as
// directive starter and will ignore the rest part as usual single-line comments.)

// The resources are built based on resource references found across all used JS files (except for #use-raw'ed ones).
// It is done via tools. Tool files are JS files of certain structure that will be invoked by ES in certain way to build resources from appropriate resource references.
// Root project file can declare tools by referencing tool files like this:

// #tool tools/l-tool.js

// For example, tools/l-tool.js builds "L" resources ("#L@/group/id:..."), which are localized text strings that can be used by the app via L$ helper (see tools/l-runtime.js).
// See the l-tool.js to get more insight into composition of a tool file.
// Tool files are _not_ linked to the resulting HTML - they are only used by ES itself.

// Tools may use tool configurations, which are also declared in project root file, like this:

// #tool-cfg L.locales: [ru, en, tr]
// ^the "L.locales" tool config is recognized by the l-tool and contains a list of locales to prepare and support.

// #tool-cfg L.cleanUnusedLocales: false
// ^the "L.cleanUnusedLocales" tool config is recognized by the l-tool and, if non-false, tells to delete locales that are not in L.locales list. Otherwise the extra locales will be preserved.

// See the tool/l-tool.js to see how these tool configurations are accessed.

// There is no restriction on which tools can use which configuration (they can even share them), or whether a configuration should be used at all.
// For example, the following configurations are unused:
// #tool-cfg UNUSED_CONFIG_VAL_1: string-value
// #tool-cfg UNUSED_CONFIG_VAL_2: "string value can be quoted \"in JS style\" if you need commas, quotes, or spaces"
// #tool-cfg UNUSED_CONFIG_VAL_3 = "= can be used instead of :"
// #tool-cfg UNUSED_CONFIG_ARRAY: [this, value, is, an, array]
// #tool-cfg UNUSED_CONFIG_DICT: [this: value, "is": "a key-value dictionary"]
// #tool-cfg UNUSED_CONFIG_DICT_2: [key1 = val1, you-can: "use ='s here as well, and mix it with ':' entries"]
// (empty [] is treated as an array)
// #tool-cfg UNUSED_CONFIG_COMPOUND = [
//  "the config can be",
//  [arbitrarily: compound]
// ]

//#tool tools/tileset-image-tool.js
// ^the tools/tileset-image-tool.js builds "#TilesetImage@/..." resources, and also provides examples of more advanced tool file capabilities and more detailed explanations on those.

// We can write the JS code right in the project file, but its main use is specification of the tools and some bootstrap
// so we'll limit to linking the file with main code and calling it

// #use /main.js
main();

// Note: instead of #use <filename>, you can use #use-raw <filename> - it will just link the JS file without parsing it for any nested ES directives or resource refs, assuming it is UTF-8 encoded.
// It is useful e. g. to link minified libraries and other 3rd party code that is not meant to be ES aware and as such should not introduce any coincident effects inside ES build