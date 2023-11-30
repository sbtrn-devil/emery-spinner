// utility to perform tasks with dynamically assignable inter-dependencies
var { Future } = require('./future.js');

function DepTaskDoer() {
	if (new.target) return DepTaskDoer();

	var me, myMark = {};
	var tasksPending = new Set(),
		tasksBlocked = new Set(),
		tasksById = new Object(),
		taskStepped = Future(),
		performInProgress = null,
		UNBLOCKER = Symbol(),
		UNBLOCKED = Symbol();

	async function perform() {
		// need to start asynchronously to prevent race with me.perform() by instant finish
		var asyncStart = Future();
		await (setTimeout(asyncStart.callback, 0), asyncStart);

		try {
			var anomalBlockCount = 0; // anti-anomal block guard
			for (;;) {
				if (tasksPending.size) {
					anomalBlockCount = 0;
					var curTask;

					//var pendingIds = new Array();
					//for (var task of tasksPending) { pendingIds.push(task.taskId); }
					//console.log("Getting next task, pending are:", pendingIds);

					// take 1st task from the queue
					for (var task of tasksPending) {
						curTask = task;
						break;
					}
					tasksPending.delete(curTask);

					// allow the task to perform
					//console.log("Into task " + curTask.taskId);
					if (curTask.loops) {
						if (curTask[UNBLOCKER] && !curTask[UNBLOCKED]) {
							curTask.taskStarter.reject(new Error("The unblocker task is not unblocked and/or a part of circular dependency"));
						} else {
							curTask.taskStarter.reject(new Error("The task is a part of circular dependency"));
						}
					} else {
						curTask.taskStarter.resolve();
					}
					await taskStepped;
					taskStepped = Future();
					//console.log("Out of task " + curTask.taskId);
				} else if (tasksBlocked.size) {
					//console.log(tasksBlocked);
					// if we got here then all remain blocked due to circular deps
					var circularTasks = getCircularDependentBlockedTasks();
					for (var task of circularTasks) {
						tasksBlocked.delete(task);
						tasksPending.add(task);
						//console.log("CIRCULAR: re-add %s", task.taskId);
					}

					if (anomalBlockCount++ > 1) {
						// anomal block encountered: all tasks are blocked, but no circular dependent tasks
						for (var taskId in tasksById) {
							var task = tasksById[taskId];
							var depdTasks = new Array();
							for (var depTask of task.dependentTasks) {
								depdTasks.push(depTask.taskId);
							}
							console.error("task: %s, %s, RC: %s, dependent: %s", taskId,
								(('result' in task) || ('error' in task))? "finished: " + (task.result || task.error) : "unfinished",
								task.pendingDepsCount,
								depdTasks);
						}
						throw new Error("Something wrong");
					}
				} else {
					var tasksByIdResult = new Object();
					for (var taskId in tasksById) {
						var task = tasksById[taskId];
						tasksByIdResult[taskId] = {
							result: task.result,
							error: task.error
						};
					}
					// all done - reset the tasks list
					tasksById = new Object();
					return tasksByIdResult;
				}
			}
		} catch (e) {
			console.log("WARNING - unexpected exception", e);
		} finally {
			performInProgress = null;
		}
	}

	function getCircularDependentBlockedTasks() {
		var scannedTasks = new Set(),
			scannedTasksStack = new Set(),
			circledTasksFound = new Set();

		function taskLoops(task) {
			return task.loops || (task.loops = new Array());
		}

		function scanTask(task) {
			if (scannedTasks.has(task)) {
				if (scannedTasksStack.has(task)) {
					// got into loop with higher stack
					var loopFound = [...scannedTasksStack].reverse();
					for (var cTask of scannedTasksStack) {
						taskLoops(cTask).push(loopFound);
						circledTasksFound.add(cTask);
					}
				}
				return;
			}
			scannedTasks.add(task);
			scannedTasksStack.add(task);
			for (var depTask of task.dependentTasks) {
				scanTask(depTask);
			}
			scannedTasksStack.delete(task);
		}

		for (var task of tasksBlocked) {
			scanTask(task);
		}

		return circledTasksFound;
	}

	function unblockDepTask(task, depTask, expError) {
		//console.log("Releasing %s from %s (%s, %s)", depTask.taskId, task.taskId, depTask.error, depTask.result);
		if (task.error || expError) {
			// if we failed, mark this in by-task-id list for all our dependent tasks
			depTask.dependencyErrors = (depTask.dependencyErrors || new Object());
			depTask.dependencyErrors[task.taskId] = task.error || expError;
			//console.log("Set dep error:", taskId, "->", depTask.taskId);
		}

		if (--depTask.pendingDepsCount == 0) {
			tasksBlocked.delete(depTask);
			if (('error' in depTask) || ('result' in depTask)) {
				// the dependency task is already done - do nothing
				//console.log("%s already finished", depTask.taskId);
			} else if (!depTask.loops) {
				tasksPending.add(depTask);
			} else {
				//console.log("NOT re-adding %s for loops", depTask.taskId);
			}
		}
	}

	function postTask(taskId, taskDoer, ...args) {
		var task = tasksById[taskId];
		if (task) {
			return task;
		}
		//console.log("POSTING TASK", taskId, new Error().stack.split("\n").filter((line) => line.indexOf('deptaskdoer.js') == -1)[1].trim());

		task = tasksById[taskId] = {
			taskId,
			pendingDepsCount: 0,
			taskStarter: Future(),
			taskGoesBlocked: Future(),
			dependentTasks: new Set(),
			setDependsOn(...depTasks) {
				if (task.loops) {
					throw new Error("This task '" + taskId + "' is a part of circular dependency, its dependencies are locked");
				}
				for (var depTask of depTasks) {
					if (depTask.loops) {
						throw new Error("Dependency task '" + depTask.taskId + "' is a part of circular dependency, depending on it is an error");
					}
					if (('error' in depTask) || ('result' in depTask)) {
						// the dependency task is already done
						continue;
					}
					if (!depTask.dependentTasks.has(task)) {
						depTask.dependentTasks.add(task);
						task.pendingDepsCount++;
						tasksPending.delete(task);
						tasksBlocked.add(task);
					}
				}
			}
		};

		tasksPending.add(task);

		function getDependencyErrorsFlat(depErrors, COUNT_MAX = 32) {
			var result = new Array(), count = 0;
			for (var taskId in depErrors) {
				if (++count <= COUNT_MAX) {
					result.push(taskId);
				}
			}
			if (count > COUNT_MAX) {
				result.push("..." + (count - COUNT_MAX) + " more");
			}
			return result;
		}

		var taskHandle = {
			get task() { return task; },
			get taskId() { return taskId; },
			get loops() { return task.loops; },
			requireSuccessfulDependencies() {
				if (task.dependencyErrors) {
					var error = new Error(taskId + ": aborting due to errors in dependencies - [" + getDependencyErrorsFlat(task.dependencyErrors) + "]");
					error.dependenciesInError = getDependencyErrorsFlat(task.dependencyErrors, Number.MAX_SAFE_INTEGER);
					throw error;
				}
			},
			async untilResumed() {
				if (task.pendingDepsCount > 0) {
					task.taskGoesBlocked.resolve(myMark);
					await task.taskStarter;
					task.taskStarter = Future();
				}
			},
			postDependencyTask(taskId, depTaskDoer, ...args) {
				var depTask = postTask(taskId, depTaskDoer, ...args);
				task.setDependsOn(depTask);
				return depTask;
			},
			postDependentTask(taskId, depTaskDoer, ...args) {
				var depTask = postTask(taskId, depTaskDoer, ...args);
				depTask.setDependsOn(task);
				return depTask;
			}
		};

		async function taskPerformer() {		
			try {
				await task.taskStarter;
				task.taskStarter = Future();
				//console.log("STARTING TASK", taskId);
				var taskDoerInProgress = taskDoer(taskHandle, ...args);
				for (;;) {
					var stepResult = await Promise.race([task.taskGoesBlocked, taskDoerInProgress]);
					if (stepResult == myMark) {
						// task requests blocked
						task.taskGoesBlocked = Future();
						taskStepped.resolve();
					} else {
						// the task has done
						task.result = stepResult;
						break;
					}
				}
			} catch (e) {
				// the task has failed
				task.error = e;
			}

			for (var depTask of task.dependentTasks) {
				unblockDepTask(task, depTask);
			}
			task.dependentTasks.clear(); // not necessary at this point, but enables some GC cleanup
			//console.log("Stepping after %s", taskId, task.error);
			taskStepped.resolve();
		}

		taskPerformer(); // start the task performing coroutine
		return task;
	}

	// an unblocker is a task that won't complete until someone explicitly unblocks it, and the only
	// thing it does it just completes (possibly propagating errors from its dependencies).
	// can be used as an extra stop lock for explicit start of some tasks in addition to completion
	// of their dependencies.
	// can be useful when several tasks posted in batch need a non-trivial coordination beyond dependency
	// mechanism, note however that it adds more chances for making an error
	function postUnblockerTask(taskId) {
		var task = tasksById[taskId];
		if (task) {
			if (!task[UNBLOCKER]) {
				throw new Error("Task '" + taskId + "' already posted and is not an unblocker task");
			}
			return task;
		}

		task = postTask(taskId, async function (task) {
			task.requireSuccessfulDependencies();
		});
		// mark the task as unblocker and set it to depend on itself - if unlocked normally,
		// this dependency is removed before it gets into loop analyzer
		task[UNBLOCKER] = true;
		task.setDependsOn(task);
		task.unblock = function unblock() {
			if (!task[UNBLOCKED]) {
				task[UNBLOCKED] = true;
				unblockDepTask(task, task);
			}
		};

		task.unblockWithError = function unblock(e) {
			if (!task[UNBLOCKED]) {
				task[UNBLOCKED] = true;
				unblockDepTask(task, task, e);
			}
		};

		return task;
	}

	return (me = {
		postTask,
		postUnblockerTask,
		perform() {
			return performInProgress || (performInProgress = perform());
		},
		get isPerformInProgress() {
			return !!performInProgress;
		}
	});
}

exports.DepTaskDoer = DepTaskDoer;