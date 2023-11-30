const fs = require('fs'),
	iconvlite = require('iconv-lite'),
	jsonBeautify = require('json-beautify'),
	njsPath = require('path');

exports.WrappedJSON = function WrappedJSON({ prologue = "", beginFragment, endFragment, epilogue = "" }) {
	if (new.target) return Framework(rootFilePath);

	var me;
	// Source: http://stackoverflow.com/questions/2593637/how-to-escape-regular-expression-in-javascript
	function regexpQuote(str) {
	    return (str+'').replace(/[.?*+^$[\]\\(){}|-]/g, "\\$&");
	};

	const regexpMatch = new RegExp("[\\S\\s].*?" +
		regexpQuote(beginFragment) +
		"(\\r?\\n|\\r\\n?)([\\S\\s]*)(\\r?\\n|\\r\\n?)" +
		regexpQuote(endFragment));
	return (me = {
		async read(path, defaultValue = {}) {
			var src = iconvlite.decode(await fs.promises.readFile(path), "utf8"),
				match = src.match(regexpMatch);
			return (match && JSON.parse(match[2])) || defaultValue;
		},
		async write(path, value) {
			var pathdir = njsPath.dirname(path);
			try {
				await fs.promises.stat(pathdir);
			} catch (e) {
				await fs.promises.mkdir(pathdir, { recursive: true });
			}
			await fs.promises.writeFile(path, prologue + "\n" +
				beginFragment + "\n" + jsonBeautify(value, null, "\t", 80) + "\n" +
				endFragment + "\n" + epilogue, "utf8");
		}
	});
};