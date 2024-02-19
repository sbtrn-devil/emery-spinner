//#charset utf-8
//#use /main-common.js

// file with a "library" function htprint
// htprint(...items) prints items into the current HTML document's "htPrintRoot" div (see es-project-src.html)
// the items can be strings (printed as is, with newlines properly converted), or HTMLElements (inserted as is),
// or blobs (inserted as <img>'s), or other objects (inserted stringified)
// for each htprint, a new div is inserted that contains the printed stuff
// htprint returns the newly inserted div, which in turn has .htprint method that continues printing into this div
// and works the same way, recursively
// htprint.hr is a special object which, passed as an item to htprint, causes emitting a <hr> tag
(() => {
	function htSubPrint(target, items) {
		for (var item of items) {
			if (item instanceof HTMLElement) {
				target.appendChild(item);
			} else if (item instanceof Blob && item.url) {
				var img = document.createElement("img");
				img.src = item.url;
				target.appendChild(img);
			} else if (Array.isArray(item)) {
				for (var i in item) {
					var subItem = item[i];
					if (i > 0 && !(subItem instanceof HTMLElement || (subItem instanceof Blob && subItem.url))) {
						var span = document.createElement("span");
						span.innerText = ",";
						target.appendChild(span);
					}
					htSubPrint(target, [subItem]);
				}
			} else if (item === htprint.hr) {
				var hr = document.createElement("hr");
				target.appendChild(hr);
			} else {
				item = String(item).split("\n");
				for (var i in item) {
					if (i > 0) {
						var br = document.createElement("br");
						target.appendChild(br);
					}
					var span = document.createElement("span");
					span.innerText = item[i];
					target.appendChild(span);
				}
			}
		}
	}

	// this will be bound to a HTMLElement
	function htprint(...items) {
		var div = document.createElement("div");
		htSubPrint(div, items);
		this.appendChild(div);
		div.htprint = htprint;
		return div;
	}

	htprint.hr = new Object();
	window.htPrintRoot.htprint = htprint;
})();

function htprint(...items) {
	return window.htPrintRoot.htprint(...items);
}
htprint.hr = window.htPrintRoot.htprint.hr;