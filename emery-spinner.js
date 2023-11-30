const yargs = require('yargs/yargs'),
	chokidar = require('chokidar'),
	readline = require('readline'),
	cliui = require('cliui'),
	{ hideBin } = require('yargs/helpers'),
	{ Filework } = require('./filework.js'),
	{ Framework } = require('./framework.js'),
	{ Future } = require('./future.js');

const MAX_IMMEDIATE_RESPINS = 4;

var argv = yargs(hideBin(process.argv))
	.version('emery-spinner 1.0.0')
	.usage('Usage: $0 <project-root-js-file> [options]')
	.example('$0 project-root.js')
	.example('$0 another-project-root.js --build-release')
	.demandCommand(1)
	.help('h')
    .alias('h', 'help')
	.boolean(['spin', 'build-release', 'build-prune', 'no-stderr'])
	.string('log-last-spin')
	.describe('spin', 'Remain running, monitoring files and automatically respin (i.e. rebuild) incrementally on changes')
	.describe('build-release', 'Build a release after build (only if no errors), you can also use \'release\' command in --spin mode')
	.describe('build-prune', 'Prune unused resources from generated resource group files (only if no errors), you can also use \'prune\' command in --spin mode')
	.describe('log-last-spin', '<filename> Tee log of last spin into the given filename (overweitten with each respin).\n'
		+ 'The filename can be skipped, then it will default to one based on the root project file.')
	.describe('no-stderr', 'Print errors to stdout rather than to stderr')
	.conflicts('spin', ['build-release', 'build-prune'])
	.check((argv, opts) => {
		if (argv['log-last-spin'] && !argv['spin']) {
			console.log("Warning: --log-last-spin only has effect in --spin mode");
		}
		return true;
	})
	.argv;

var spinnerSignal = Future(),
	spinnerFiles = new Set(),
	spinnerCommands = new Array(),
	spinnerTimeout = null;
function setupSpinner(filework) {
	function onUpdate(path) {
		var projectPath = filework.realPathToProjectPath(path);
		if (projectPath) {
			spinnerFiles.add(projectPath);
			spinnerSignal.resolve();
		}
		// otherwise, ignore unrecognized files
	}

	chokidar.watch(filework.projectPathToRealPath('/'), {
		ignored: /^.*[\/\\]node_modules(?=$|[\/\\]).*/
	}).on('unlink', onUpdate)
	.on('change', onUpdate);

	const rli = readline.createInterface({
		input: process.stdin
	});

	rli.on('line', (line) => {
		spinnerCommands.push(line);
		spinnerSignal.resolve();
	});
}

async function forSpinnerSignal() {
	var isImmediateRespin = true;

	if (spinnerTimeout !== null) {
		clearTimeout(spinnerTimeout);
	}
	spinnerTimeout = setTimeout(() => {
		spinnerTimeout = null;
		isImmediateRespin = false;
	}, 250);

	await spinnerSignal;
	return isImmediateRespin;
}

async function main() {
	var projectRootFile = argv._[0];
	if ('log-last-spin' in argv) {
		// enable log last spin to argv['log-last-spin'] || projectRootFile + ".es-last.log"
	}
	var filework = new Filework(projectRootFile),
		framework,
		commands = new Set(),
		spinMode = argv.spin,
		firstSpin = true;

	function printHelp() {
		var ui = cliui({ width: 64 });
		ui.div(
			"prune\t  Prune unused resources from group files (only if no spin errors)\n" +
			"release\t  Assemble release HTML (only if no spin errors)\n" +
			"respin\t  Perform a respin\n" +
			"respin-full\t  Perform a full (non-incremental) respin\n" +
			"halt\t  Suspend auto-respins, useful e. g. for large edits in tool files\n"+
			"nodes\t  Print the current project model graph\n" +
			"errors\t  Print the nodes in error after the last respin\n" +
			"exit\t  Exit gracefully (you can also use Ctrl-C for hard exit)\n" +
			"help\t  Print this help");
		framework.logInfo(ui.toString());
	}


	if (argv['build-prune']) {
		commands.add('prune');
	}
	if (argv['build-release']) {
		commands.add('release');
	}

	function createOrRecreateFramework() {
		framework = new Framework(projectRootFile);
		framework.addCheckRoots(); // for initial spin (and the only one if no spinMode)
		framework.noStdErr = !!argv['no-stderr'];
	}
	createOrRecreateFramework();

	if (spinMode) {
		setupSpinner(filework);
		if ('log-last-spin' in argv) {
			await framework.reopenLogFile(argv['log-last-spin']);
		}
	}

	var respinSuccess = false,
		onHalt = false,
		justPrintStatus = false,
		immediateRespinsInRow = 0,
		itemsInErrorLastRespin = new Set(),
		actualRespin = false,
		wasImmediateRespin = false;

	do {
		try {
			if (!onHalt && !justPrintStatus) {
				if (wasImmediateRespin) {
					framework.logDebug("Immediate respin!");
				}

				if (!wasImmediateRespin) {
					// rewrite last spin log, unless there was an immediate respin
					if ('log-last-spin' in argv) {
						await framework.reopenLogFile(argv['log-last-spin']);
					}
				}
				itemsInErrorLastRespin = await framework.perform(commands);
				actualRespin = true;
				if (itemsInErrorLastRespin.size > 0 && spinMode) {
					framework.logInfo("Type 'errors' for summary error dump");
				}
			}
		} catch (e) {
			framework.logError("Fatal respin error: ", e);
			itemsInErrorLastRespin = new Set(["FATAL ERROR"]);
		}

		commands = new Set();
		if (spinMode) {
			if (!onHalt) {
				framework.logInfo("\n=== %s Spinner standby... ===", new Date().toLocaleTimeString());
				if (firstSpin) {
					framework.logInfo("(tip: stdin works in this mode - type command or help)");
				}
			} else {
				framework.logInfo("\n=== %s Spinner on halt! ===", new Date().toLocaleTimeString());
				framework.logInfo("respin, respin-full, release or prune to resume");
			}
			firstSpin = false;
			justPrintStatus = false;
			AWAIT_RESPIN: for (;;) {
				wasImmediateRespin = await forSpinnerSignal();

				if (wasImmediateRespin) {
					if (actualRespin) {
						++immediateRespinsInRow;
						actualRespin = 0;
					}

					if (immediateRespinsInRow > MAX_IMMEDIATE_RESPINS) {
						framework.logError("=== Alert!!! More than %s quick auto-respins in a row - probably a tool error!\n" +
							"=== Auto-respins on halt to prevent idle grind.", MAX_IMMEDIATE_RESPINS);
						onHalt = true;
						justPrintStatus = true;
						immediateRespinsInRow = 0;
						break AWAIT_RESPIN;
					}
				} else {
					immediateRespinsInRow = 0;
				}

				var affectedFiles = spinnerFiles,
					inputCommands = spinnerCommands,
					cmdRespin = false;

				// re-arm the spinner
				spinnerSignal = Future();
				spinnerFiles = new Set();
				spinnerCommands = new Array();

				for (var inputCommand of inputCommands) {
					inputCommand = inputCommand.trim();
					switch (inputCommand) {
					case '': continue; // no command - do nothing
					case 'prune': commands.add('prune'); break;
					case 'release': commands.add('release'); break;
					case 'respin-full':
						createOrRecreateFramework();
						// fallthrough
					case 'respin':
						cmdRespin = true;
						break;
					case 'halt':
						onHalt = true;
						framework.logInfo("Putting the spinner on manual halt");
						break AWAIT_RESPIN;
					case 'help':
						printHelp();
						justPrintStatus = true;
						break AWAIT_RESPIN;
					case 'nodes':
						framework.depGraph.printDeps("", framework.logInfo, itemsInErrorLastRespin);
						justPrintStatus = true;
						break AWAIT_RESPIN;
					case 'errors':
						if (itemsInErrorLastRespin.size <= 0) {
							framework.logInfo("No errors after last respin");
						} else {
							framework.logInfo("Items in error after last respin:");
							for (var errorItem of itemsInErrorLastRespin) {
								framework.logInfo("- %s:", errorItem[0]);
								var errors = errorItem[1];
								if (errors.length > 0 || errors.dependencyErrors.size > 0) {
									framework.logInfo(errorItem[1]);
								}
							}
							framework.logInfo("Total errors: %s", itemsInErrorLastRespin.size);
						}
						justPrintStatus = true;
						break AWAIT_RESPIN;
					case 'exit': process.exit(0); break;
					default:
						framework.logInfo("Unknown command '%s', type 'help' for help", inputCommand);
						break;
					}
				}

				var affectedNodes = framework.getKnownNodeIdsByProjPaths(affectedFiles);
				if (commands.size > 0 || cmdRespin) {
					onHalt = false;
					immediateRespinsInRow = 0;
				}

				if (affectedNodes.size > 0 || commands.size > 0 || cmdRespin) {
					if (!cmdRespin) {
						// mark nodes (these will be only file:/... in our case) for check
						for (var affectedNodeId of affectedNodes) {
							framework.addCheckNode(affectedNodeId, true);
						}
					}
					if (!onHalt) break;
				}
			}
		}
	} while (spinMode);

	//framework.depGraph.printDeps("root:/test-prj.js");
}

main();
