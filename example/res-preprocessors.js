// A resource preprocessor that will do some magic for our example program...
_EmerySpinnerRuntime_.registerValuePreprocessor(function preprocess(value/*, preprocessValue*/) {
	// note that value may be not just a root resource object, but as well an object nested at a deeper json level...
	switch (value && value["@type"]) {
	case "%blob":
		// convert objects { "@type": "%blob", "mimetype": "...", "base64": "..." }
		// to blobs with appropriate mimetype, content and an URL, which will be placed into the blob's .url property
		var blob = new Blob([Uint8Array.from(atob(value.base64), (c) => c.charCodeAt(0))], { type: value.mimetype });
		blob.url = URL.createObjectURL(blob);
		return blob; // note that object returned by the preprocessor is not re-preprocessed in deep - it is assumed opaque and complete
		// you can, however, preprocess any json value explicitly with the same preprocessors stack as your current preprocessor is part of -
		// to do that, use the 2nd argument of the preprocess function (i. e. preprocessValue), it is a function that can be
		// used as: var preprocessedValue = preprocessValue(sourceValue);
	}
});