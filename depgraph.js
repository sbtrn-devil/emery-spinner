// utility to keep track on an abstract dependency graph model
exports.DepGraph = function DepGraph() {
	if (new.target) return DepGraph();

	var me,
		nodes = new Object(), // node ID => { ... }
		nodesWithUnverifiedDependencies = new Set(),
		invalidNodesAfterLastCheck = new Set();

	function getNode(nodeId) {
		if (typeof (nodeId) !== 'string') {
			throw new Error("Node ID must be a string");
		}

		var node = nodes[nodeId];
		if (!node) {
			node = nodes[nodeId] = {
				id: nodeId,
				dependsOn: new Set(),
				dependedOn: new Set(),
				unverifiedDependsOn: new Set(),
				isTerminal: false,
				data: new Object(),

				addDependency(sourceNodeId) {
					return addDependency(nodeId, sourceNodeId);
				},

				removeDependency(sourceNodeId) {
					return removeDependency(nodeId, sourceNodeId);
				},

				clearDependencies() {
					return clearDependencies(nodeId);
				},

				getDependencyIds() {
					var depIds = new Array();
					for (var sourceNode of node.dependsOn) {
						depIds.push(sourceNode.id);
					}
					return depIds;
				},

				getDependentIds() {
					var depIds = new Array();
					for (var sourceNode of node.dependedOn) {
						depIds.push(sourceNode.id);
					}
					return depIds;
				},

				setTerminal() {
					if (!node.isTerminal) {
						node.isTerminal = true;
						for (var sourceNode of node.dependsOn) {
							sourceNode.dependedOn.delete(node);
						}
						node.unverifiedDependsOn.clear();
						nodesWithUnverifiedDependencies.delete(node);
					}
				},

				get isOrphaned() {
					return node.dependsOn.size <= 0;
				}
			};
		}

		return node;
	}

	function getNodeIfExists(nodeId) {
		if (typeof (nodeId) !== 'string') {
			throw new Error("Node ID must be a string");
		}

		return nodes[nodeId] || null;
	}

	function addDependency(targetNodeId, sourceNodeId) {
		var targetNode = getNode(targetNodeId),
			sourceNode = getNode(sourceNodeId);

		if (targetNode.isTerminal) {
			throw new Error("Terminal node " + targetNodeId + " must have no incoming dependencies");
		}

		if (!targetNode.dependsOn.has(sourceNode)) {
			// this dependency does not yet exist - add it, and add to unverified list
			targetNode.dependsOn.add(sourceNode);
			if (!targetNode.isTerminal) {
				targetNode.unverifiedDependsOn.add(sourceNode);
				// adding a dependency requires verification (unless target is a terminal node)
				nodesWithUnverifiedDependencies.add(targetNode);
			}
			sourceNode.dependedOn.add(targetNode);			
		}
	}

	function removeDependency(targetNodeId, sourceNodeId) {
		var targetNode = getNodeIfExists(targetNodeId),
			sourceNode = getNodeIfExists(sourceNodeId);
		if (!targetNode || !sourceNode) return;

		if (targetNode.dependsOn.has(sourceNode)) {
			// this dependency exists - remove it
			targetNode.dependsOn.delete(sourceNode);
			targetNode.unverifiedDependsOn.delete(sourceNode);
			sourceNode.dependedOn.delete(targetNode);
		}
	}

	// clear the current incoming dependencies of the node
	function clearDependencies(targetNodeId) {
		var targetNode = getNodeIfExists(targetNodeId);
		if (!targetNode) return;

		for (var sourceNode of targetNode.dependsOn) {
			sourceNode.dependedOn.delete(targetNode);
		}
		targetNode.dependsOn.clear();
		targetNode.unverifiedDependsOn.clear();
		// that's all for now - clearing dependencies does require verification
	}

	function deleteNode(nodeId) {
		var node = nodes[nodeId];
		if (!node) {
			return; // no node already, nothing to do
		}

		// delete ingoing and outgoing dependencies
		clearDependencies(nodeId);
		for (var dependentNode of node.dependedOn) {
			dependentNode.dependsOn.delete(node);
		}
		node.dependedOn.clear();

		// delete the node from the registries
		nodesWithUnverifiedDependencies.delete(node);
		delete nodes[nodeId];
	}

	// verify dependencies (updated since last verification), report and delete
	// the offending ones
	// note: errors = output array
	function verifyDepGraph(errors) {
		var offendingNodesFound = new Set();
		invalidNodesAfterLastCheck.clear();
		var nodesVisited = new Set();
		for (var checkFromNode of nodesWithUnverifiedDependencies) {
			var nodesVisitChain = new Set();
			function check(node) {
				if (nodesVisited.has(node)) {
					return true; // already visited
				}

				if (nodesVisitChain.has(node.id)) {
					var chainFailed = [...nodesVisitChain];
					errors.push("circular dependency in chain: " + chainFailed.slice(chainFailed.indexOf(node.id)).join(" <- "));
					return false;
				}
			 	nodesVisitChain.add(node.id);
			 	try {
					var checkOk = true;
					for (var dependencyNode of node.dependsOn) {
						checkOk &= check(dependencyNode);
					}

					if (checkOk) {
						// check passed
						node.unverifiedDependsOn.clear();
						return true;
					}

					// check failed - remove the unverified dependencies as offending
					var offendingDeps = [...node.unverifiedDependsOn];
					for (var dependencyNode of offendingDeps) {
						removeDependency(node.id, dependencyNode.id);
					}
					offendingNodesFound.add(node);
					return false;
				} finally {
					nodesVisited.add(node);
					nodesVisitChain.delete(node.id);
				}
			}

			if (!check(checkFromNode)) {
				offendingNodesFound.add(checkFromNode);
				invalidNodesAfterLastCheck.add(checkFromNode);
			}
		}

		return offendingNodesFound;
	}

	return (me = {
		nodes,
		getNode,
		getNodeIfExists,
		deleteNode,
		verifyDepGraph,
		printDeps(rootId, log = console.log, errors = new Set()) {
			var nodesVisited = new Set(), nodesVisitedStack = new Set();
			function printNode(node, indent) {
				var alreadyVisited = nodesVisited.has(node), alreadyInStack = nodesVisitedStack.has(node);
				var toPrint = alreadyInStack? node.id + " - CIRCULAR!" : node.id;
				if (errors.has(node.id)) {
					toPrint += " [in error]";
				}
				log(toPrint.padStart(toPrint.length + indent, " "));
				if (!alreadyVisited) {
					nodesVisited.add(node);
					for (var subNode of node.dependsOn) {
						printNode(subNode, indent + 1);
					}
				}
			}

			for (var nodeId in nodes) {
				var node = nodes[nodeId];
				if (node.dependedOn.size <= 0 || nodeId == rootId) {
					printNode(node, 0);
				}
			}
		}
	});
};
