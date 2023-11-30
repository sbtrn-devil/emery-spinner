// API to run an object in a subprocess and expose its interface into the parent process via JS proxy
const { fork } = require('child_process'),
	util = require('util'),
	{ Future } = require('./future.js');

function Queue() {
	if (new.target) return Queue();

	var me, items = null, buffer = new Array(), signal = Future();

	return (me = {
		async expect() {
			for (;;) {
				if (!items) {
					await signal;
					signal = Future();
					items = buffer.reverse();
					buffer = new Array();
				}

				if (items.length > 0) {
					var result = items.pop();
					if (!items.length) {
						items = null;
					}
					return result;
				}
			}
		},

		post(item) {
			buffer.push(item);
			signal.resolve();
		}
	});
}

function packageValue(o) {
	switch (typeof (o)) {
	case 'string':
	case 'object':
		if (!o) return o; // null/undefined
		switch (o.__proto__.constructor.name) {
		case 'Array':
			var result = { type: 'array', data: new Array() };
			for (var item of o) result.data.push(packageValue(item));
			return result;
		case 'String':
			return result = { type: 'string', data: o };
		case 'Object':
			var result = { type: 'object', data: new Object() };
			for (var k in o) result.data[k] = packageValue(o[k]);
			return result;
		// TODO: AsyncFunction ?

		default:
			return { type: 'opaque', data: o };
		}

	default: return o;
	}
}

function unpackageValue(o) {
	if (typeof (o) === 'object' && o && o.type && o.__proto__.constructor.name === 'Object') {
		switch (o.type) {
		case 'string': return o.data;
		case 'object':
			var result = new Object();
			for (var k in o.data) result[k] = unpackageValue(o.data[k]);
			return result;
		case 'array':
			var result = new Array();
			for (var item of o.data) result.push(unpackageValue(item));
			return result;
		case 'opaque': return o.data;
		// otherwise undefined
		}
	} else return o;
}

// call in the child process - expose the serverIface which is object of { async method1(...), async method2(...), ... }
function runServer(serverIface, performOnShutdown) {
	var cmdQueue = Queue();
	process.on('message', (msg) => {
		cmdQueue.post(msg);
	});

	process.on('disconnect', async () => {
		if (performOnShutdown) {
			await performOnShutdown();
		}
		process.exit();
	});

	async function run() {
		async function runIfaceMethod(id, method, args) {
			var result;
			try {
				result = { "return": id, "value": packageValue(await serverIface[method](...args)) };
			} catch (e) {
				result = { "error": id, "value": packageValue(e) };
			}
			process.send(result);
		}

		for (;;) {
			var cmd = await cmdQueue.expect();
			switch (cmd.type) {
			case 'call':
				runIfaceMethod(cmd.id, cmd.method, cmd.args);
				break;
			}
		}
	}
	run();

	return ({
		processSendMsg(msg) { process.send(msg); }
	});
}

// returns: client handle: object with:
// performOnStartup = property, set to async function that is to be called when the subprocess is (re)started
// (the subprocess is started on-demand, so set performOnStartup before any server calls)
// client = proxies the server calls - just call its methods to forward them to the server
// close = close this client handle and shut down the server subprocess
function openClient(path, ...args) {
	var running = true,
		subprocess = null,
		performOnStartup = null,
		queue = Queue(),
		pendingCalls = new Map(),
		pendingCallId = 0,
		me;

	async function ensureSubprocess() {
		if (!subprocess) {
			subprocess = fork(path, args, { serialization: 'advanced' });
			var sp = subprocess;

			subprocess.on('disconnect', () => {
				if (subprocess != sp) return; // don't react to missed process commands

				subprocess = null;
				sp.unref();
				var callsToTerminate = pendingCalls;
				pendingCalls = new Map();
				var error = new Error("Tool subprocess aborted");
				for (var [k, v] of callsToTerminate) {
					v.reject(error);
				}
			});

			subprocess.on('message', (msg) => {
				if ('log' in msg) {
					switch(msg.log) {
					case 'error': me.logErrorWithSource(msg.source, msg.msg); break;
					case 'info': me.logInfoWithSource(msg.source, msg.msg); break;
					default: me.logDebugWithSource(msg.source, msg.msg); break; // case 'debug'
					}
				} if ('return' in msg) {
					var id = msg.return, pendingCall = pendingCalls.get(id);
					pendingCalls.delete(id);
					if (pendingCall) pendingCall.resolve(unpackageValue(msg.value));
				} else if ('error' in msg) {
					var id = msg.error, pendingCall = pendingCalls.get(id);
					pendingCalls.delete(id);
					if (pendingCall) pendingCall.reject(unpackageValue(msg.value));
				}
			});

			if (performOnStartup) await performOnStartup();
		}
	}

	return (me = {
		set performOnStartup(pos) {
			performOnStartup = pos;
		},

		logErrorWithSource() { "[logErrorWithSource is not redirected]" },
		logInfoWithSource() { "[logInfoWithSource is not redirected]" },
		logDebugWithSource() { "[logDebugWithSource is not redirected]" },

		client: new Proxy({}, {
			get(target, name) {
				return async function(...args) {
					await ensureSubprocess();
					const callId = ++pendingCallId;
					var result = Future();
					pendingCalls.set(callId, result);
					subprocess.send({ type: 'call', id: callId, method: name, args });
					try {
						return await result;
					} catch (e) {
						if (e instanceof Error) {
							// an error can be wrapped for better stack trace
							var err = Error(e.message);
							err.cause = e; // somehow not set by Error(msg, { cause: ... }) ctor
							throw err;
						}
					    throw e;
					}
				}
			}
		}),
		close() {
			if (subprocess) {
				subprocess.disconnect();
				subprocess = null;
				running = false;
			}
		}
	});
}

exports.runServer = runServer;
exports.openClient = openClient;