const fs = require('fs'),
	iconvlite = require('iconv-lite');

// parse (lexic) content of single-line comment block as potential list
// of commands
function *parseSLComment(jsStr, curLine) {
	var lastMatchedTokenLine;

	function tryRegex(regex) {
		lastMatchedTokenLine = curLine;
		return jsStr.match(regex);
	}

	const RGX_NEWLINE_CTR = /\r?\n/g;

	function advanceOverMatch(match) {
		var skipOver = match[0];
		curLine += [...skipOver.matchAll(RGX_NEWLINE_CTR)].length;
		jsStr = jsStr.substring(skipOver.length);
	}

	function tryRegexAndAdvance(regex) {
		var match = tryRegex(regex);
		if (match) {
			advanceOverMatch(match);
		}
		return match;
	}

	function isEof() {
		return jsStr.length <= 0;
	}

	const RGX_WHITESPACES = /^\s+?(?=\S|\r?\n|\n?\r|$)/;
	const RGX_NEWLINE = /^(\r?\n|\n\r?)/;
	const RGX_COMMAND = /^(\r?\n|\n\r?)\s*#((?!LP)(\p{N}|\p{L}|[-_$.])*)/u;
	const RGX_TOKEN = /^[^\s,:=\[\]]+/;
	const RGX_DQ_STRING = /^"([^"\\\r\n]|\\(\r\n?|\n\r?|.|$))*("|$|(?=\r?\n|\n\r?))/;
	const RGX_SQ_STRING = /^'([^'\\\r\n]|\\(\r\n?|\n\r?|.|$))*('|$|(?=\r?\n|\n\r?))/;
	const RGX_PUNCT = /^[\[\]:=,]/;
	const RGX_ANYTHING_ELSE = /^.?/;

	while (!isEof()) {
		if (token = tryRegexAndAdvance(RGX_COMMAND)) {
			yield { type: "cmd", value: token[2], line: lastMatchedTokenLine };
			continue;
		}

		if (token = tryRegexAndAdvance(RGX_WHITESPACES)) {
			continue;
		}

		if (token = tryRegexAndAdvance(RGX_NEWLINE)) {
			continue;
		}

		if (token = tryRegexAndAdvance(RGX_DQ_STRING)) {
			var correctString = token[0];
			if (!token[3]) correctString += '"';
			yield { type: "token", value: eval(correctString), line: lastMatchedTokenLine };
			continue;
		}

		if (token = tryRegexAndAdvance(RGX_SQ_STRING)) {
			var correctString = token[0];
			if (!token[3]) correctString += "'";
			yield { type: "token", value: eval(correctString), line: lastMatchedTokenLine };
			continue;
		}

		if (token = tryRegexAndAdvance(RGX_PUNCT)) {
			yield { type: "punct", value: token[0], line: lastMatchedTokenLine };
			continue;
		}

		if (token = tryRegexAndAdvance(RGX_TOKEN)) {
			yield { type: "token", value: token[0], line: lastMatchedTokenLine };
			continue;
		}

		tryRegexAndAdvance(RGX_ANYTHING_ELSE);
	}
}

// parse (syntax) token list obtained from parseSLComment into actual list
// of commands, collect any errors if identified
// (note: errors = output array)
function parseSLCommands(slTokensArray, errors) {
	if (slTokensArray.length <= 0) {
		return [];
	}

	var cursor = 0,
		lastToken = slTokensArray[slTokensArray.length - 1];

	function isNext(offset, type, value) {
		var node = slTokensArray[cursor + offset];
		return !!(node && node.type === type && (!value || node.value === value));
	}

	function isEof() {
		return !slTokensArray[cursor];
	}

	function tokenToString(token) {
		if (!token) {
			return "end of input";
		} else {
			var value = token.value;
			if (token.type === "cmd") value = "#" + value;
			return "'" + value + "'";
		}
	}

	function tokenToLine(token) {
		if (!token) {
			return "";
		} else {
			return "line " + token.line + ": ";
		}
	}

	function parseValue() {
		var tokenStartAt = slTokensArray[cursor];
		if (isNext(0, "punct", "[")) {
			// start of array
			cursor++;
			var arrayHolder = new Array();
			var result = parseValues(arrayHolder);
			if (!isNext(0, "punct", "]")) {
				errors.push(tokenToLine(slTokensArray[cursor - 1])
				+ "Unexpected " + tokenToString(slTokensArray[cursor]) + " after "
				+ tokenToString(slTokensArray[cursor - 1]) + ", expected ',' or ']'");
			} else {
				cursor++;
			}

			return result;
		} else if (isNext(0, "token")) {
			// a token value
			return { type: "token", value: slTokensArray[cursor++].value, line: tokenStartAt.line }
		}

		return; // failed to parse a value here
	}

	function parseKeyValue() {
		if (isNext(0, "token") && (isNext(1, "punct", ":") || isNext(1, "punct", "="))) {
			// a valid key
			var keyToken = slTokensArray[cursor];
			cursor += 2;
			var value = parseValue();
			if (!value) {
				errors.push(tokenToLine(keyToken)
					+ "Unexpected non-value " + tokenToString(slTokensArray[cursor])
					+ " after key " + tokenToString(keyToken));
				return; // failed to parse a key-value here
			} else {
				return { type: "keyValue", key: keyToken.value, value, line: keyToken.line };
			}
		}

		return; // failed to parse a key-value here
	}

	function parseValuesList() {
		var result = new Array(),
			tokenStartAt = slTokensArray[cursor] || lastToken;
		for (var first = true;; first = false) {
			var value = parseValue();
			if (value) {
				result.push(value);
				if (isNext(0, "punct", ",")) {
					cursor++;
					continue;
				}
			}

			if (!value && !first) {
				errors.push(tokenToLine(slTokensArray[cursor - 1])
					+ "Unexpected " + tokenToString(slTokensArray[cursor]) + " after "
					+ tokenToString(slTokensArray[cursor - 1]) + ", expected value or end of list");
			}
			return { type: "array", items: result, line: tokenStartAt.line };
		}
	}

	function parseKeyValuesList() {
		var result = new Array(),
			tokenStartAt = slTokensArray[cursor] || lastToken;
		for (var first = true;; first = false) {
			var keyValue = parseKeyValue();
			if (keyValue) {
				result.push(keyValue);
				if (isNext(0, "punct", ",")) {
					cursor++;
					continue;
				}
			}

			if (!keyValue && !first) {
				errors.push(tokenToLine(slTokensArray[cursor - 1])
					+ "Unexpected " + tokenToString(slTokensArray[cursor]) + " after "
					+ tokenToString(slTokensArray[cursor - 1]) + ", expected key or end of list");
			}
			return { type: "array", items: result, line: tokenStartAt.line };
		}
	}

	function parseValues() {
		if (isNext(0, "token") && (isNext(1, "punct", ":") || isNext(1, "punct", "="))) {
			return parseKeyValuesList();
		} else {
			return parseValuesList();
		}
	}

	function parseCommand() {
		var line = slTokensArray[cursor].line;
		return { cmd: slTokensArray[cursor++].value, args: parseValues(), line };
	}

	function valueToFVal(value) {
		// value.type == token | array
		if (value.type === "array") {
			return arrayToFVal(value);
		} else {
			// token
			return value.value;
		}
	}

	function arrayToFVal(arr) {
		// arr.type == "array", items = array
		if (arr.items.length) {
			if (arr.items[0].type === "keyValue") {
				// it is an dictionary type array
				var result = new Object();
				for (var item of arr.items) {
					result[item.key] = valueToFVal(item.value);
				}
				return result;
			} else {
				// it is an array-type array
				var result = new Array();
				for (var item of arr.items) {
					result.push(valueToFVal(item));
				}
				return result;
			}
		} else {
			// empty array maps to empty array
			return [];
		}
	}

	var result = new Array();
	while (!isEof()) {
		if (isNext(0, "cmd")) {
			var cmd = parseCommand();
			cmd.args = arrayToFVal(cmd.args);
			result.push(cmd);
		} else {
			cursor++;
		}
	}

	return result;
}

// parse javascript (note: errors = output array)
function *parseJS(jsStr, errors) {
	var curLine = 1, lastMatchedTokenLine;

	function tryRegex(regex) {
		lastMatchedTokenLine = curLine;
		return jsStr.match(regex);
	}

	const RGX_NEWLINE_CTR = /\r?\n/g;

	function advanceOverMatch(match) {
		var skipOver = match[0];
		curLine += [...skipOver.matchAll(RGX_NEWLINE_CTR)].length;
		jsStr = jsStr.substring(skipOver.length);
	}

	function tryRegexAndAdvance(regex) {
		var match = tryRegex(regex);
		if (match) {
			advanceOverMatch(match);
		}
		return match;
	}

	function isEof() {
		return jsStr.length <= 0;
	}

	const RGX_WHITESPACES = /^\s+?(?=\S|\r?\n|\n?\r|$)/;
	const RGX_NEWLINE = /^(\r?\n|\n\r?)/;
	const RGX_SL_COMMENT = /^(\s*\/\/.*?(\r?\n|\n?\r|$))+/;
	const RGX_ML_COMMENT = /^\/\*.*?(\*\/|$)/;
	const RGX_REGEX = /^\/([^\\\/]|\\.)*(\/[A-Za-z]*|$)/;
	const RGX_NONVALUE_KEYWORDS = /^return\b/;
	const RGX_OPEN_BRACKETS = /^[\(\[\{]/;
	const RGX_CLOSE_BRACKETS = /^[\)\]\}]/;
	const RGX_ISTR_SINGLE = /^`([^`\\$]|\\(\r?\n|\r\n?|.|$))*(`|$)/;
	const RGX_ISTR_OPEN = /^`([^`\\$]|\\(\r?\n|\r\n?|.|$))*\$\{/;
	const RGX_ISTR_MIDDLE = /^\}([^`\\$]|\\(\r?\n|\r\n?|.|$))*\$\{/;
	const RGX_ISTR_CLOSE = /^\}([^`\\$]|\\(\r?\n|\r\n?|.|$))*(`|$)/;
	const RGX_NUMERIC = /^\p{N}(\p{N}|\p{L}|[_$.])*/u;
	const RGX_LETTERIC = /^(\p{L}|[_$])(\p{N}|\p{L}|[_$])*/u;
	const RGX_DQ_STRING = /^"([^"\\\r\n]|\\(\r\n?|\n\r?|.|$))*("|$|(?=\r?\n|\n\r?))/;
	const RGX_SQ_STRING = /^'([^'\\\r\n]|\\(\r\n?|\n\r?|.|$))*('|$|(?=\r?\n|\n\r?))/;
	const RGX_ANYTHING_ELSE = /^.?/;

	const RGX_SL_BOL = /(^|\r\n?|\r\n?)\s*\/\//g;

	const bracketStack = new Array();
	function bracketStackTop() { return bracketStack.length ? bracketStack[bracketStack.length - 1] : null; }
	var token, wasValue = false;
	while (!isEof()) {
		if (token = tryRegexAndAdvance(RGX_NEWLINE)) {
			continue;
		}

		if (token = tryRegexAndAdvance(RGX_WHITESPACES)) {
			continue;
		}

		if (token = tryRegexAndAdvance(RGX_SL_COMMENT)) {
			yield { type: "slcomment", data: parseSLCommands (
				[...parseSLComment("\n" + token[0].replace(RGX_SL_BOL, '$1'), lastMatchedTokenLine)], errors),
				line: lastMatchedTokenLine };
			continue;
		}

		if (token = tryRegexAndAdvance(RGX_ML_COMMENT)) {
			//yield { type: "mlcomment", data: token[0], line: lastMatchedTokenLine };
			continue;
		}

		if (token = tryRegexAndAdvance(RGX_NONVALUE_KEYWORDS)) {
			//yield { type: "nwk", data: token[0], line: lastMatchedTokenLine };
			wasValue = false;
			continue;
		}

		if ((token = tryRegexAndAdvance(RGX_NUMERIC)) || (token = tryRegexAndAdvance(RGX_LETTERIC))) {
			//yield { type: "value", data: token[0], line: lastMatchedTokenLine };
			wasValue = true;
			continue;
		}

		if (token = tryRegexAndAdvance(RGX_OPEN_BRACKETS)) {
			//yield { type: "open", data: token[0], line: lastMatchedTokenLine };
			switch (token[0]) {
			case '(': bracketStack.push("par"); break;
			case '[': bracketStack.push("bkt"); break;
			case '{': bracketStack.push("brc"); break;
			}
			wasValue = false;
			continue;
		}

		if ((token = tryRegexAndAdvance(RGX_SQ_STRING)) ||
			(token = tryRegexAndAdvance(RGX_DQ_STRING)) ||
			(token = tryRegexAndAdvance(RGX_ISTR_SINGLE))) {
			try {
				yield { type: "string", data: eval(token[0]), line: lastMatchedTokenLine };
			} catch (e) {
				// don't yield incorrect strings
			}
			wasValue = true;
			continue;
		}

		if (token = tryRegexAndAdvance(RGX_ISTR_SINGLE)) {
			//yield { type: "istr_single", data: token[0], line: lastMatchedTokenLine };
			wasValue = true;
			continue;
		}

		if (token = tryRegexAndAdvance(RGX_ISTR_OPEN)) {
			//yield { type: "istr_open", data: token[0], line: lastMatchedTokenLine };
			bracketStack.push("istr");
			wasValue = false;
			continue;
		}

		if (bracketStackTop() == "istr") {
			if (token = tryRegexAndAdvance(RGX_ISTR_MIDDLE)) {
				//yield { type: "istr_middle", data: token[0], line: lastMatchedTokenLine };
				wasValue = false;
				continue;
			}

			if (token = tryRegexAndAdvance(RGX_ISTR_CLOSE)) {
				//yield { type: "istr_close", data: token[0], line: lastMatchedTokenLine };
				bracketStack.pop();
				wasValue = true;
				continue;
			}
		}

		if (token = tryRegexAndAdvance(RGX_CLOSE_BRACKETS)) {
			//yield { type: "close", data: token[0], line: lastMatchedTokenLine };
			switch (token[0]) {
			case ')':
				if (bracketStackTop() == "par") bracketStack.pop();
				wasValue = true;
				break;
			case ']':
				if (bracketStackTop() == "bkt") bracketStack.pop();
				wasValue = true;
				break;
			case '}':
				if (bracketStackTop() == "brc") bracketStack.pop();
				wasValue = false;
				break;
			}
			continue;
		}

		if (!wasValue && (token = tryRegexAndAdvance(RGX_REGEX))) {
			//yield { type: "regex", data: token[0], line: lastMatchedTokenLine };
			wasValue = true;
			continue;
		}

		if (token = tryRegexAndAdvance(RGX_ANYTHING_ELSE)) {
			//yield { type: "gen", value: token[0], line: lastMatchedTokenLine };
			wasValue = false;
		}
	}
}

const RGX_RESREF = /^#[^@]+@/;

// return: { charset: ..., commands: [...], resRefs: [...], errors: [...] }
async function readJSFile({ path, acceptCharset = true, isRawFile = false }) {
	var srcBin;
	try {
		var srcBin = await fs.promises.readFile(path);
	} catch (e) {
		return { charset: "utf-8", commands: [], resRefs: [], errors: [ "can not read file - " + e.message ] };
	}

	if (isRawFile) {
		// do not decore raw files further
		return { charset: "utf-8", commands: [], resRefs: [], errors: [] };
	}

	var src = iconvlite.decode(srcBin, "utf8"), iconvCharset = "utf8";
	RE_READ: for (var charset = false;;) {
		var result = { charset: charset || "utf-8", iconvCharset, commands: new Array(), resRefs: new Array(), errors: new Array() };

		for (var tok of parseJS(src, result.errors)) {
			if (tok.type === "slcomment") {		
				for (var cmd of tok.data) {
					result.commands.push(cmd);

					if (acceptCharset && cmd.cmd === 'charset') {
						if (!cmd.args[0]) {
							result.errors.push("line " + cmd.line + ": expected a charset name");
							continue;
						}
						var newCharset = cmd.args[0];
						if (charset != newCharset) {
							if (!charset) {
								charset = newCharset;
								try {
									src = iconvlite.decode(srcBin, (iconvCharset = newCharset.toLowerCase().replace('-', '')));
								} catch (e) {
									result.errors.push("line " + cmd.line + ": can not use charset " + cmd.args[0] + " - " + e);
								}

								continue RE_READ;
							} else {
								result.errors.push("line " + cmd.line + ": only one charset can be set per file");
							}
						}
					}
				}
			}

			if (tok.type === "string" && tok.data.match(RGX_RESREF)) {
				result.resRefs.push(tok);
			}
		}
		break;
	}

	return result;
}

exports.readJSFile = readJSFile;
