//#charset utf-8
//#use /main-common.js

// "library" file that extracts tiles to global associative dict

var allTilesById = new Object(); // tile ID -> blob
for (var tilesetRes of [
	// a string with a resource reference is enough to include it into build and packaging
	// (caution - _any_ string that fits res ref format counts (except for template literals with embedded expressions),
	// regardless on context in which it is found - a part of expression, a json key, a case label, etc...)
	R$["#TilesetImage@/img/the-tileset.json"]
]) {
	for (var tile of tilesetRes.tiles) {
		// resource preprocessor turned tile.img from {base64,mimetype,@type="%blob"} into blob with URL,
		// so we can write just like that:
		allTilesById[tile.id] = tile.img;
	}
}