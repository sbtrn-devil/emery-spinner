//#charset utf-8

// this will link content of l-common into target HTML along with l-runtime.js
// and make it occur before contents of l-runtime.js:
// #use l-common.js
// (note that space indentation is allowed between // and # for ES directives)

// Usage: L$`#L@/xxx[:[lang]hint]`({ ...format dict... } [, "doms"])
// The resulting string is allowed to contain placeholders - alphanumeric IDs (-, ., _ included) enclosed in %-s,
// or starting with % and ending with a non-ID char, or %% for literal "%" - e. g.: "this is %i%th bottle of %total (%pct123-1% %%)".
// Values to these placeholders will be supplied via format dict object (e. g. { i: 1, total: 20, "pct123-1": 5 } for the example above).
// Placeholders with no values provided will stay as %id%'s.
// The actual "doms" literal parameter will deliver the result as an array of DOM objects that can be appended into a HTMLElement, with
// blobs in placeholder values interpreted as <img> tags sourced to these blobs. String placeholders will be converted to sequences of
// HMTLElement's (<span>s and <br>s), HTMLElement placeholders will be inserted directly.
// With "doms" omitted, or given a different value, the result will be returned as a formatted string, the placeholders will be
// converted to string and inserted as strings.
function L$(formatOrResIdArr) {
	if (!Array.isArray(formatOrResIdArr) || formatOrResIdArr.length != 1) {
		throw Error("L$ should be used as a string template tag (L$`...`) with no embedded expressions");
	}
	var formatter = L$.formattersCache.get(formatOrResIdArr);
	if (!formatter) {
		var str = formatOrResIdArr[0],
			resRefParsed = L_common.parseResRef(str);
		if (resRefParsed) {
			str = R$[resRefParsed.resId];
			if (!str || str["@type"] != 'localized_string') {
				str = "[" + resRefParsed.resId + " IS NOT A LOCALIZED STRING RESOURCE]";
				var doms = L$.stringToDoms(str);
				formatter = function L$_fallbackFormatter(obj, type) {
					return type === "doms"? doms : str;
				};
			} else {
				var cachedStrsByLocale = new Object(), // { locale => { strs: [str,...], placeholders: [placeholderID,...] } }
					cachedDomsByLocale = new Object(), // { locale => { doms: [[...],...], placeholders: [placeholderID,...] } }
					cachedDefStrs = { strs: [resRefParsed.resId], placeholders: [] },
					cachedDefDoms = { doms: [L$.stringToDoms(resRefParsed.resId)], placeholders: [] }
				for (var locale in str) {
					if (locale == "@type" || locale == "_hint") continue;
					var cachedStrs = { strs: new Array(), placeholders: new Array() },
						cachedDoms = { doms: new Array(), placeholders: new Array() },
						stringSplit = str[locale].split(L$.placeholderRegexp),
						n = stringSplit.length; // always an odd number (substrings separated with parsed placeholders)
					for (var i = 0; i < n; i += 2) {
						cachedStrs.strs.push(stringSplit[i]);
						cachedDoms.doms.push(L$.stringToDoms(stringSplit[i]));
						if (i + 1 < n) {
							// placeholder incoming
							var placeholderId = stringSplit[i + 1].replace(L$.trimPctRegexp, "");
							cachedStrs.placeholders.push(placeholderId);
							cachedDoms.placeholders.push(placeholderId);
						}
					}
					cachedStrsByLocale[locale] = cachedStrs;
					cachedDomsByLocale[locale] = cachedDoms;
				}
				formatter = function L$_formatter(fmtDictObj = {}, type) {
					fmtDictObj ||= {};
					if (type == "doms") {
						// doms
						var result = new Array(),
							doms = cachedDomsByLocale[L$.locale] ?? cachedDefDoms,
							n = doms.doms.length;
						for (var i = 0; i < n; i++) {
							result.push(...doms.doms[i]);
							if (i < n - 1) {
								var placeholderId = doms.placeholders[i], // placeholderId == "%" at this point means literal "%"
									placeholderValue = placeholderId == "%" ? "%" :
									(fmtDictObj[placeholderId] ?? ("%" + placeholderId + "%"));
								if ((placeholderValue instanceof Blob) && placeholderValue.url) {
									var img = document.createElement("img");
									img.src = placeholderValue.url;
									result.push(img);
								} else {
									result.push(...L$.stringToDoms(String(placeholderValue)));
								}
							}
						}

						return result;
					} else {
						// string
						var result = new Array(), // string builder
							strs = cachedStrsByLocale[L$.locale] ?? cachedDefStrs,
							n = strs.strs.length;
						for (var i = 0; i < n; i++) {
							result.push(strs.strs[i]);
							if (i < n - 1) {
								var placeholderId = strs.placeholders[i], // placeholderId == "%" at this point means literal "%"
									placeholderValue = placeholderId == "%" ? "%" :
									(fmtDictObj[placeholderId] ?? ("%" + placeholderId + "%"));
								result.push(String(placeholderValue));
							}
						}

						return result.join("");
					}
				};
			}
		}

		L$.formattersCache.set(formatOrResIdArr, formatter);
	}

	return formatter;
}
L$.placeholderRegexp = /%(%|[-0-9A-Za-z_.]+%?)/;
L$.trimPctRegexp = /(?<!^)%$/;
L$.formattersCache = new Map();
L$.stringToDoms = function stringToDoms(str) {
	var strings = str.split("\n"),
		result = new Array();
	for (var i = 0; i < strings.length; i++) {
		var span = document.createElement("span");
		span.innerText = strings[i];
		result.push(span);
		if (i < strings.length - 1) {
			var br = document.createElement("br");
			result.push(br);
		}
	}
	return result;
};
L$.locale = "en"; // this can be changed
