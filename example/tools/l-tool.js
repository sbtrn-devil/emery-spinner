//#builds-res L
//#use-cfg L.locales, L.cleanUnusedLocales
//-#debug

// This tool builds "#L@/path/id:[lo]opt-hint" resources, which are localizeable text strings.
// Given the set of locales in L.locales tool cfg, e. g. [en, ru], it constructs resource of the following structure:
// "L@/path/id": {
// "en": "string for EN locale",
// "ru": "string for RU locale"
// ... // etc.
// }
// The locale strings are filled with placeholders on the resource creation (or re-creation) from scratch,
// which then are supposed to be manually edited inplace to become the valid localizations.
// The initial value for placeholders can be specified by the hint in form of [original-locale]string, e. g. "[en]Test text".
// The placeholder will also contain "<LOCALE_ORG_HINT>" or "<UNTRANSLATED>" fragment to indicate that it was filled by the tool
// and requires re-edit (be careful, the locale can be overwritten if you change its non-empty hint in a res spec - based on
// assumption you intent to alter this string and hence all of its localizations).
// If you are using hints, there is an additional convenience option to use "?" instead of the id (e. g. "path/?"), in which case
// the actual ID will be determined based on hash of the hint. It can save time on inventing IDs for ad hoc strings during an active
// coding stage, but after some time you can end up with a number of unused strings that take up space and just are getting in the way -
// to handle this, use prune command on some regular basis (at least before building a release).
// L.cleanUnusedLocales=true causes the tool to actively clean up locales that happen to be no longer in L.locales list. Otherwise
// the extra locales are preserved.

const {
	L_common,
	hash
} = require('./l-common.js'),
	AT_TYPE = "localized_string";

var config = {
	L: {}
};

module.exports = {
	"L": {
		async init({ toolkit }) {
			toolkit.logDebug("L: CONFIG", toolkit.getToolsConfig("L.locales"));
			toolkit.logDebug("L: CONFIG", !!toolkit.getToolsConfig("L.cleanUnusedLocales"));
			config.L.locales = new Set(toolkit.getToolsConfig("L.locales") || ["en"]);
			config.L.cleanUnusedLocales = !!toolkit.getToolsConfig("L.cleanUnusedLocales");
		},
		// return: {resId: string, group: "/path/grp", hint: any|null}
		// missing or null group = default group
		async parseResourceRef({ resRef, toolkit }) {
			var parseResRef = L_common(toolkit).parseResRef,
				match = parseResRef(resRef),
				group = match.group,
				resId = match.resId;
			return { resId, group, hint: match.textHint ? { text: match.textHint, lang: match.locale } : null };
		},
		// return: [..."/file/path"|"#Res@id"] (or Set of strings)
		// May be called repeatedly! This is expected e. g. if dependencies are listed in a file, which is itself a dependency
		// (not in this tool though).
		// Only the files and resources need to be here that will be accessed in the rebuildResource, simple resref strings
		// can be used without listing them for dependencies.
		async getBuildDependencies({ resId, toolkit }) {
			return [];
		},
		// return: true|false
		// is allowed to access dependency files/resources via toolkit
		async isResourceUpToDate({ resId, hint, target, toolkit }) {
			toolkit.logDebug("L: Check up to date " + resId);
			var locales = config.L.locales, // config is the tool configs store, get "L.locales" cfg from it - note how the dot maps
				hintLocale = hint ? hint.lang : null;
			var result = true;
			if (target["@type"] != AT_TYPE) {
				toolkit.logDebug("L: " + resId + " is not validly @type'd, require rebuild");
				result = false;
			}

			// the "locales", as per specification in root project file, is an array of strings
			for (var locale of locales) {
				if (!(locale in target)) {
					toolkit.logDebug("L: " + resId + " has no locale " + locale + ", require rebuild");
					result = false;
				}
			}

			// if cleanUnusedLocales enabled then delete the unnecessary locales
			if (config.L.cleanUnusedLocales) {
				for (var locale in target) {
					if (locale != '_hint' && locale != '@type' && !locales.has(locale)) {
						toolkit.logDebug("L: " + resId + " has unused locale " + locale + ", require rebuild");
						result = false;
					}
				}
			}

			if (result) {
				if (hint && target['_hint'] != hash(hint.text)) {
					// hint is other than in resource
					toolkit.logDebug("L: " + resId + " has changed hint text, rebuild");
					return false;
				}
			}
			return result;
		},
		// return: none
		// target is the resource body, assign to target members or read them
		async rebuildResource({ resId, hint, target, toolkit }) {
			toolkit.logDebug("L: Rebuilding " + resId, hint);
			var locales = config.L.locales,
				hintLocale = hint ? hint.lang : null,
				placeholderText = "<UNTRANSLATED>" + (hint ? hint.text : resId);
			if (hint && target['_hint'] != hash(hint.text)) {
				// hint is other than in the resource
				toolkit.clearObjectProperties(target);
				target['_hint'] = hash(hint.text);
			}
			target['@type'] = AT_TYPE;
			for (var locale of locales) {
				if (!(locale in target)) {
					target[locale] = (locale == hintLocale) ? "<LOCALE_ORG_HINT>" + hint.text : placeholderText;
				}
			}

			// if cleanUnusedLocales enabled then delete the unnecessary locales
			if (config.L.cleanUnusedLocales) {
				var localesToDelete = new Array();
				for (var locale in target) {
					if (locale != '_hint' && locale != '@type' && !locales.has(locale)) {
						localesToDelete.push(locale);
					}
				}

				if (localesToDelete.length > 0) {
					toolkit.logDebug("L: removing unused locales " + localesToDelete + " from " + resId);
					for (var locale of localesToDelete) {
						delete target[locale];
					}
				}
			}
		}
	}
};
