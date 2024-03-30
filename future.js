// Future - awaitable and resolvable interface
// use:
// var f = new Future();
// ...in async function:
// var r = await f;
// ...elsewhere: f.resolve("result"); or f.reject(e);
// ...or: f.callback(e); or f.callback(null, "result");
// (f.callback can be used to accept result from node.js callback-style
// APIs)
// Future is thenable, so can be await'ed
function Future() {
	if (new.target) return Future();

	var reject,
		resolve,
		promise = new Promise(
			function (res, rej) {
				reject = rej;
				resolve = res;
			}),
		done = false,
		result,
		failure;

	var me = {
		__proto__: Future.prototype,

		// Resolves the Future with the given result, repeated calls have no effect
		resolve(arg) { if (!done) { done = true; result = arg; resolve(arg); } },

		// Rejects the Future with the given result, repeated calls have no effect
		reject(arg) { if (!done) { done = true; failure = arg; reject(arg); } },

		// Callback to resolve/reject in node.js callback style,
		// the callback returned will only have effect on 1st call
		callback(err, result) {
			if (err) {
				me.reject(err);
			} else {
				me.resolve(result);
			}
		},

		// true if future is completed
		get done() { return done; }, // true if future is completed

		// result (undefined until resolved)
		get result() { return result; }, 

		// failure (only meaningful if rejected)
		get failure() { return failure; }, 
		then: promise.then.bind(promise),
		catch: promise.catch.bind(promise)
	};

	return me;
}

exports.Future = Future;