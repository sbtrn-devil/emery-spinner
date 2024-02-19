//#charset utf-8
//#use /main-common.js
//#use /lib-tiles.js
//#use /lib-htprint.js

function arrayShuffle(arr) {
	var n = arr.length;
	for (var i = 0; i < n; i++) {
		var j = Math.floor(Math.random() * n);
		[arr[i], arr[j]] = [arr[j], arr[i]];
	}
}
function arrayChooseFrom(arr) {
	return arr[Math.floor(Math.random() * arr.length)];
}

var Generator = {
	createBlankGrid({ width, height }) {
		var grid = new Array();
		for (var i = 0; i < height; i++) {
			var gridLine = new Array();
			gridLine.length = width;
			gridLine.fill(allTilesById["blank"]);
			grid.push(gridLine);
		}

		return grid;
	},

	// components = { tileId: count, tileId: count, ... }
	// the filler will do its best to fit the given number of given tiles into
	// the given subgrid, the excess cells will be filled with blanks
	fillSubGridRandom({ grid, top, left, width, height, components }) {
		var choices = new Array(), cellsInSubGrid = width * height;
		for (var tileId in components) {
			var tileCount = components[tileId];
			for (var i = 0; i < tileCount; i++) choices.push(allTilesById[tileId]);
		}

		// pad choices with blanks (if needed)
		if (choices.length < width * height) {
			for (; choices.length < cellsInSubGrid;) choices.push(allTilesById["blank"]);
		}

		arrayShuffle(choices);
		var k = 0;
		for (var i = top; i < top + height; i++) {
			for (var j = left; j < left + width; j++) {
				grid[i][j] = choices[k++];
			}
		}
	},

	symmetrizeSubGrid({ grid, top, left, width, height, horizontal = true, vertical = true }) {
		var right = left + width - 1, bottom = top + height - 1,
			xLast = vertical ? left + Math.ceil(width * 0.5) - 1 : right,
			yLast = horizontal ? top + Math.ceil(height * 0.5) - 1 : bottom;

		for (var i = top; i <= yLast; i++) {
			for (var j = left; j <= xLast; j++) {
				if (horizontal) grid[bottom - (i - top)][j] = grid[i][j];
				if (vertical) grid[i][right - (j - left)] = grid[i][j];
				if (horizontal && vertical) grid[bottom - (i - top)][right - (j - left)] = grid[i][j];
			}
		}
	},

	fillSubGridMain({ grid, top, left, width, height, components }) {
		var have2Odds = false, have4Odds = false, totalNonBlank = 0;

		for (var tileId in components) {
			var tileCount = components[tileId];
			if (tileCount%2) have2Odds = true;
			if (tileCount%4) have4Odds = true;
			totalNonBlank++;
		}

		if (totalNonBlank <= 0) {
			// this is going to be a clearly blank grid
			Generator.fillSubGridRandom({ grid, top, left, width, height, components: {}});
			return;
		}

		var options = new Array();
		if (!have4Odds && width > 1 && height > 1) options.push("4way");
		if (!have2Odds) {
			if (height > 1) options.push("2way-hz");
			if (width > 1) options.push("2way-vt");
		}

		// if none of these fits, and there is still enough space, try 2way-splits
		if (options.length <= 0 && totalNonBlank < width * height) {
			if (width > 1) options.push("split-vt");
			if (height > 1) options.push("split-hz");
		}

		// if still no success, fill randomly
		if (options.length <= 0) {
			Generator.fillSubGridRandom({ grid, top, left, width, height, components });
			return;
		}

		// given array of counters per component, return array of counts per same components divided by the factor
		// (assuming the counters are divisible by the factor)
		function getComponentsDivided(components, factor) {
			var dividedComponents = new Object();
			for (var i in components) {
				dividedComponents[i] = components[i] / factor;
			}
			return dividedComponents;
		}

		// partition array of counters per component into two, half of count in each, the odd units are
		// distributed between partitions on random and so that there was no exceeded total limit in each
		// (assuming totalLimit is greater or equal than half of the total of the source array)
		// return: [components_for_partition_1, components_for_partition_2]
		function getComponentsPartitioned(components, totalLimit) {
			var partition1 = new Object(), total1 = 0,
				partition2 = new Object(), total2 = 0;
			for (var tileId in components) {
				var lesser = Math.floor(components[tileId] * 0.5),
					bigger = Math.ceil(components[tileId] * 0.5);
				if (Math.random() < 0.5 && total1 < totalLimit) {
					// the bigger goes to partition 1, the lesser to partition 2
					partition1[tileId] = bigger; total1 += bigger;
					partition2[tileId] = lesser; total2 += lesser;
				} else {
					// the other way round
					partition1[tileId] = lesser; total1 += lesser;
					partition2[tileId] = bigger; total2 += bigger;
				}
			}
			return [partition1, partition2];
		}

		// choose and follow an option
		var option = arrayChooseFrom(options);
		switch (option) {
		case "4way":
			Generator.fillSubGridMain({ grid, top, left,
				width: Math.ceil(width * 0.5), height: Math.ceil(height * 0.5),
				components: getComponentsDivided(components, 4) });
			Generator.symmetrizeSubGrid({ grid, top, left, width, height,
				horizontal: true, vertical: true });
			break;
		case "2way-hz":
			Generator.fillSubGridMain({ grid, top, left,
				width, height: Math.ceil(height * 0.5),
				components: getComponentsDivided(components, 2) });
			Generator.symmetrizeSubGrid({ grid, top, left, width, height,
				horizontal: true, vertical: false });
			break;
		case "2way-vt":
			Generator.fillSubGridMain({ grid, top, left,
				width: Math.ceil(width * 0.5), height,
				components: getComponentsDivided(components, 2) });
			Generator.symmetrizeSubGrid({ grid, top, left, width, height,
				horizontal: false, vertical: true });
			break;
		case "split-hz":
			var [compTop, compBottom] = getComponentsPartitioned(components, Math.ceil(width * height * 0.5));
			Generator.fillSubGridMain({ grid, top, left,
				width, height: Math.ceil(height * 0.5),
				components: compTop });
			Generator.fillSubGridMain({ grid, top: top + height * 0.5, left,
				width, height: Math.ceil(height * 0.5),
				components: compBottom });
			break;
		case "split-vt":
			var [compLeft, compRight] = getComponentsPartitioned(components, Math.ceil(width * height * 0.5));
			Generator.fillSubGridMain({ grid, top, left,
				width: Math.ceil(width * 0.5), height,
				components: compLeft });
			Generator.fillSubGridMain({ grid, top, left: left + width * 0.5,
				width: Math.ceil(width * 0.5), height,
				components: compRight });
			break;
		}
	},

	printGrid({ grid, printRoot = window.htPrintRoot }) {
		for (var gridLine of grid) {
			printRoot.htprint(gridLine);
		}
	}
};
