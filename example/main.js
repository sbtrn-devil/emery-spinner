//#charset win-1251
//#use /main-common.js
//#use /lib-htprint.js
//#use /lib-tiles.js
//#use /lib-generator.js

async function main() {
	for (var locale of ["ru", "en", "tr"]) {
		L$.locale = locale;

		// note the `#L@/...`-s below are both declarations and use of the L type resources,
		// and also note they are used in their special designed convenience way (via L$ template
		// literal helper rather than by direct access via R$) - look at /tools/l-common.js and
		// /tools/l-runtime.js to see under the hood
		// similarly, you can design any access pattern for your resources on top of R$ facility
		// that fits you best
		htprint(L$ `#L@/txt/?:[en]Hello in ES example demo program, (locale)...`());

		htprint(L$ `#L@/txt/?:[en]Featuring tiles:`());
		htprint(L$ `#L@/txt/?:[en]blank = %0%`([allTilesById["blank"]], "doms"));
		htprint(L$ `#L@/txt/?:[en]cross = %0%`([allTilesById["cross"]], "doms"));
		htprint(L$ `#L@/txt/?:[en]brick = %0%`([allTilesById["brick"]], "doms"));
		htprint(L$ `#L@/txt/?:[en]dot = %0%`([allTilesById["dot"]], "doms"));
		htprint(L$ `#L@/txt/?:[en]...and others`({}, "doms"));

		htprint(L$ `#L@/txt/algo-desc:[ru]Алгоритм размещения заданного числа...`({}, "doms"));

		var grid = Generator.createBlankGrid({ width: 32, height: 32 });

		var components = new Object();
		for (var tileId of ["cross", "dot", "dash", "solid", "brick"]) {
			components[tileId] = 32 + 2 * Math.floor(Math.random() * 32);
		}

		htprint(L$ `#L@/txt/?:[en]Example for: %0%`([JSON.stringify(components)], "doms"));

		Generator.fillSubGridMain({
			grid,
			top: 0,
			left: 0,
			width: 32,
			height: 32,
			components
		});
		Generator.printGrid({ grid });

		htprint(L$ `#L@/txt/untranslated:[en]This message is intentionally left untranslated`(),
			htprint.hr);
	}
}