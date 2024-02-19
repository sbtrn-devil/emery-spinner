//#charset utf-8
//^only has effect via #use from the app JS (l-runtime.js in our case)
// ES directives are ignored in files that are require'd from a tool JS

(() => {
	const REGEXP_L_STD_LOCALE = /^(?:\[(.*?)\])?([\S\s]*)$/;

	function cyrb53(str, seed = 0) {
	    let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
	    for(let i = 0, ch; i < str.length; i++) {
	        ch = str.charCodeAt(i);
	        h1 = Math.imul(h1 ^ ch, 2654435761);
	        h2 = Math.imul(h2 ^ ch, 1597334677);
	    }
	    h1  = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
	    h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
	    h2  = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
	    h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  
	    return 4294967296 * (2097151 & h2) + (h1 >>> 0);
	}

	const chars = "012345689ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

	function hash(str) {
		var hchars = new Array(), base = chars.length, i = 0;
		for (var binHash = cyrb53(str); binHash > 0; binHash = Math.floor(binHash / base)) {
			hchars[i++] = chars[binHash % base];
		}
		return hchars.join('');
	}

	function parseResRef(resRef, parseStdResRef, ignoreNonLResRefs) {
		var stdMatch = parseStdResRef(resRef);
		// ^in node.js, as in a tool, it is parseStdResRef from toolkit
		// in the browser, as a page code, it is parseStdResRef from _EmerySpinnerRuntime_
		// in either case, the stdMatch is either null, if resRef fails to parse as a res ref
		// of recommended ("standard") ES res ref format, e. g. "#L@group/path/id:[en]text", or is an object:
		// {
		//	type: <type of the resource> ("L"),
		//	path: <normalized path to group> ("/group/path", would be like this for "group/path", "/group/path", "group//path", etc.),
		//	name: <name of the resource> ("id"),
		//	hint: the hint part ("[en]text"), empty if no hint,
		//	get group() the group ("/group/path"), calculated dynamically based on current path property
		//	get resId() the resource ID with normalized group path and stripped hint ("#L@/group/path/id"),
		// suitable for lookup in R$, calculated dynamically based on current type, path and name properties
		// };
		if (!stdMatch || stdMatch.type != 'L') {
			if (ignoreNonLResRefs) return null;
			else throw Error("Malformed #L@ resource ref " + resRef);
		}
		var [ allHint, locale, textHint ] = stdMatch.hint.match(REGEXP_L_STD_LOCALE),
			anonymousResId = !stdMatch.name || stdMatch.name == '?';

		if (textHint) {
			if (!locale) throw Error("Text hint in #L@ resource ref requires locale prefix");
			if (anonymousResId) {
				// for anonymous ID, build the ID from the text hint hash
				stdMatch.name = "?" + hash(textHint);
			}
		} else {
			// disallow empty resId
			if (anonymousResId) throw Error("Anonymous ID in #L@ is only allowed with text hint");
		}
		stdMatch.textHint = textHint;
		stdMatch.locale = locale;
		return stdMatch;
	}

	if (typeof (exports) !== 'undefined') {
		// node.js export to emery-spinner tool
		exports.L_common = function L_common(toolkit) {
			return {
				parseResRef(resRef) {
					return parseResRef(resRef, toolkit.parseStdResRef, false);
				}
			};
		};
		exports.hash = hash;
	} else {
		// global export to browser
		globalThis.L_common = {
			parseResRef(resRef) {
				return parseResRef(resRef, _EmerySpinnerRuntime_.parseStdResRef, true);
			}
		};
	}
})();