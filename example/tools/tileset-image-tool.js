//#builds-res TilesetImage

// This tool builds #TilesetImage@/specfile.json resource, where specfile.json is expected to be an input spec:
// {
//	"image": "image.png", // tiles atlas, path to image is relative to path of the specfile
//	"tileSize": [sizeX, sizeY], // size of single tile in pixels
//	"tiles": {
//		"tileId1": [tile1X, tile1Y], // coords of tile named tileId1 in the atlas, in tile units
//		"tileId2": [tile2X, tile2Y], // same for tile named tileId2
//		... // and for other tiles
//	}
// }

// The output (as would be accessible via R$["#TilesetImage@/specfile.json"] without preprocessing) is:
// {
// "tiles": [
//	{
//		"id": "tileId1",
//		"img": {
//			"@type": "%blob",
//			"mimetype": "image/png",
//			"base64": "...pngfile of the tile in base64..."
//		}
// 	},
//	{
//		"id": "tileId2",
//		...
//	},
//	...
// ]
// }

// And, by means of preprocessors magic (see /res-preprocessors.js), it transforms into:
// {
// "tiles": [
//	{
//		"id": "tileId1",
//		"img": Blob for tileId1's image, with added .url property to use in <img src=...>
// 	},
//	{
//		"id": "tileId2",
//		"img": Blob for tileId2's image...
//	},
//	...
// ]
// }
// - which is the form the R$["#TilesetImage@/specfile.json"] is intended to be visible to the end user

//-#debug
//^you can use #debug to enable debug-level logging (toolkit.logDebug) in this tool

// While your tool is under debug, you may need to keep runnning it on particular resource(s), while ignoring any other
// resources of this type. In order to do so, add a #build-test "#YourType@/resource-hint" (or several ones) into the tool file,
// and comment out or remove them after no longer needed.

//-#build-test "#TilesetImage@/img/the-tileset.json"

// The #build-test can be used in the non-tool JS files as well, although with a slightly different behaviour - it tells ES to treat
// the listed resource(s) as rebuildable on each respin, but won't affect buildability of any other resources of the same type.

// Now let's actually get to the code...

const fs = require('fs'),
	jimp = require('jimp'),
	Future = require('emery-spinner/future.js').Future; // a useful tool existence of which we'll leverage, purely to save on some code

// a helper function, reads the spec file and returns it as parsed object that will be stored in cache (tilesetResDesc below),
// see the main tool body for use and explanation
async function readTilesetImageSpec({ toolkit, specFileProjPath }) {
	// the function logic is quite straightforward, but also note how the toolkit is used to handle the file
	// the file is read using usual fs API, but the real path needed for it must be obtained from the spec file's project path -
	// this is what toolkit provides, and getting it is only allowed if the file is a dependency of the context resource
	// (see getBuildDependencies) - toolkit enforces this convention and throws an error if it is violated
	var path = toolkit.getFileRealPath(specFileProjPath),
		specSrc = await fs.promises.readFile(path, "utf8"),
		spec = JSON.parse(specSrc);
	if (!spec.image) {
		throw new Error("TilesetImage: the spec JSON file " + specFileProjPath + " must have 'image' member");
	}

	// we treat the path to image in the spec file as relative to the spec file's directory, unless it starts from '/',
	// in which case it is project root relative. In any case, we need to establish project path to the image file here
	// for more conveninence at later steps
	spec.specFileProjPath = specFileProjPath;
	spec.imgProjPath = (spec.image[0] == '/') ? spec.image : specFileProjPath.replace(/[^\/]+$/, spec.image);
	return spec;
}

// cache for the tool's resources intermediate data
var tilesetResDesc = {
	// resId => {}
}; // note the tool JS environment resets on each respin (build session)

// the tool's main body
module.exports = {
	// a tool file can describe tools for multiple res types, so the body is dictionary by the res type
	"TilesetImage": {

		// step 0 - init
		// its purpose is compatibility checks and possibly initialization of auxiliary tools for the current
		// respin
		async init({ toolkit }) {
			toolkit.logInfo("Initializing TilesetImage tool, ES toolkit version =", toolkit.apiVersion);
			// nothing to do here, just display when this is called and show toolkit.apiVersion in action
			// in case of init error, this could throw something
		},

		// step 1 - parse resource ref
		// this must return canonic resource id, the group to attribute it, and a hint to up-to-date checker
		// and builder (see steps 3-4 below)
		// If using a hint, note it is not guaranteed to always reach checker and builder on rebuilds (especially
		// when the resource is referenced from other resources or from more than one place in the source .js files),
		// so do not take it for granted and assume that on next build of same resource the it may be missing (null
		// or empty), which should best be interpreted as "use the same hint as last time it was provided".
		// The presence or absence of the hint must also be not critical for the build logic, so only use it for
		// non-essential optional data, like for convenience defaults
		async parseResourceRef({ resRef, toolkit }) {
			var stdMatch = toolkit.parseStdResRef(resRef);
			return { resId: stdMatch.resId, group: stdMatch.group, hint: null };
		},

		// step 2 - get resource dependencies
		// must return the list of dependencies as a set of strings, where strings of format "#blahblah@..." are
		// treated as resource refs (
		async getBuildDependencies({ resId, toolkit }) {
			var stdMatch = toolkit.parseStdResRef(resId),
				resDesc = tilesetResDesc[resId] || (tilesetResDesc[resId] = {});
			toolkit.logDebug("TSI: getting deps for ", stdMatch);

			var deps = new Set(),
				specFileProjPath = stdMatch.dirPath + "/" + stdMatch.name;

			// first obvious dependency is the spec file
			deps.add(specFileProjPath);

			// note that getBuildDependencies will be invoked multiple times, until its next call returns same set of dependencies
			// each next time can make use of the previous runs - for example, after we declared specFileProjPath we can use it with toolkit
			if (toolkit.isFileAllowed(specFileProjPath)) {
				// (see readTilesetImageSpec where it is actually used)
				var spec = await readTilesetImageSpec({ toolkit, specFileProjPath });
				toolkit.logDebug("TSI - image path:", spec.imgProjPath);

				// the 2nd dependency is the image file, which we obtain after reading the spec file
				deps.add(spec.imgProjPath);
				resDesc.spec = spec;
			}

			toolkit.logDebug(deps);
			return deps;
		},

		// step 3 - check if the resource is up to date
		// the existing resource object (unpreprocessed JSON-compatible object, as it is in the group file)
		// is supplied in target param, it can be read (is always an Object, at least empty one), but no modifications
		// to it are allowed at this step.
		// Note this tool uses no hints, so hint is omitted from the args of isResourceUpToDate & rebuildResource
		// otherwise the args would be { resId, hint, target, toolkit } (tool-l.js gives an example of that)
		async isResourceUpToDate({ resId, target, toolkit }) {
			toolkit.logDebug("TSI: Check up to date " + resId);
			var resDesc = tilesetResDesc[resId], // we get here after getBuildDependencies finishes being called for the resId, so can be sure that resDesc is completely filled
				imgFileTS = await toolkit.getFileTimestamp(resDesc.spec.imgProjPath),
				specFileTS = await toolkit.getFileTimestamp(resDesc.spec.specFileProjPath),
				targetTS = target._ts || 0;
				// ^note that we expect a _ts member with last built timestamp - it is not a magic name, see below how we get it
			return targetTS >= imgFileTS && targetTS >= specFileTS;
		},

		// step 4 - rebuild the resource
		// you can modify target object at this point, note that the runtime does not clear it for you and leaves it with
		// the same filling it was left at previous build (empty if none), and probably with some manual edits in between
		// (it is up to your design whether the resource type needs/allows any manual edits). It is up to you to perform
		// reset if needed and/or any required conistency checks.
		// Toolkit provides toolkit.clearObjectProperties method for your convenience to delete all properties from an Object.
		async rebuildResource({ resId, target, toolkit }) {
			toolkit.logDebug("TSI: Rebuilding " + resId);
			var resDesc = tilesetResDesc[resId],
				resSpec = resDesc.spec, // if we are doing things correct, the spec is still cached
				imgFileTS = await toolkit.getFileTimestamp(resSpec.imgProjPath),
				specFileTS = await toolkit.getFileTimestamp(resDesc.spec.specFileProjPath),
				imgFromFile = await jimp.read(toolkit.getFileRealPath(resSpec.imgProjPath));
			var [tileSizeX, tileSizeY] = resSpec.tileSize;
			if (typeof (tileSizeX) != 'number' || typeof (tileSizeY) != 'number')
				throw Error("TSI - " + resId + ": \"tileSize\": [int, int] is required");
			tileSizeX |= 0; tileSizeY |= 0;

			var tiles = new Array();
			for (var tileId in resSpec.tiles) {
				// for each tile...
				var tile = resSpec.tiles[tileId],
					[tileX, tileY] = tile;
				if (typeof (tileX) != 'number' || typeof (tileY) != 'number')
					throw Error("TSI - " + resId + ": tile must be specified as \"tileid\": [int, int] inside \"tiles\": {...}");
				// prepare the tile image
				var imgFuture = Future();
					// jimp has a quite moronish constructor-with-callback style for new image API
					tileImg = new jimp(tileSizeX, tileSizeY, imgFuture.callback);
				await imgFuture;
				// paste the appropriate part from the main tileset image into it
				tileImg.blit(imgFromFile, 0, 0, tileSizeX * tileX, tileSizeY * tileY, tileSizeX, tileSizeY);
				var tileImgAsBuffer = await tileImg.getBufferAsync('image/png');
				tiles.push({
					id: tileId,
					img: {
						"@type": "%blob",
						mimetype: 'image/png',
						base64: tileImgAsBuffer.toString('base64')
					}
				});
			}
			target.tiles = tiles;

			// this is where we fill the _ts - as part of resource it'll persist, and we'll be able to check it
			// in isResourceUpToDate of the next build.
			// Storing timestamp in the resource itself is a useful trick if up-to-date check by fair comparison is difficult or not possible
			target._ts = Math.max(imgFileTS, specFileTS);
		}
	}
};