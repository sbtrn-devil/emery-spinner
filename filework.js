// utility for calculating project-relative and actual file paths
var njsPath = require('path'),
	fs = require('fs');

exports.Filework = function Filework(rootFilePath) {
	if (new.target) return Filework(rootFilePath);

	var me,
		rootFileName = njsPath.basename(rootFilePath),
		rootDir = njsPath.dirname(rootFilePath),
		rootProjPath = "/" + rootFileName,
		absRootDir = njsPath.resolve(rootDir);

	function projectPathToRealPath(projFilePath) {
		return njsPath.join(rootDir, projFilePath);
	}

	function realPathToProjectPath(realPath) {
		var fullRealPath = njsPath.resolve(realPath);
		if (fullRealPath.substring(0, absRootDir.length) != absRootDir) {
			return null;
		}
		return fullRealPath.substring(absRootDir.length).replace(/[\/\\]+/g, '/');
	}

	return (me = {
		projectPathToRealPath,
		realPathToProjectPath,
		pathGetterRelToProjFilePath(projFilePath) {
			return ({
				// convert file name relative to this file's path to project path
				fileNameToProjPath(fileName) {
					fileName = fileName.replace(/[\/\\]/g, njsPath.sep);
					projFilePath = projFilePath.replace(/[\/\\]/g, njsPath.sep);
					var basedir = njsPath.normalize(njsPath.dirname(fileName)),
						basename = njsPath.basename(fileName),
						myProjDir = njsPath.dirname(projFilePath);
					var isProjRelative = false;
					if (basedir[0] == njsPath.sep) {
						isProjRelative = true;
						basedir = basedir.substring(1);
					}

					var suggPath, normRootDir = njsPath.normalize(rootDir);
					if (normRootDir == ".") normRootDir = ""; // we need normRootDir to remove it from the result as a prefix
					if (isProjRelative) {
						suggPath = njsPath.normalize(rootDir + njsPath.sep + basedir + njsPath.sep + basename);
					} else {
						suggPath = njsPath.normalize(rootDir + myProjDir + njsPath.sep + basedir + njsPath.sep + basename);
					}
					if (suggPath.substring(0, normRootDir.length) != normRootDir) {
						throw new Error("File " + fileName + " - no going above project root dir is allowed");
					}
					suggPath = suggPath.substring(normRootDir.length);

					var path = njsPath.sep + suggPath;
					return path.replace(/[\/\\]+/g, '/');
				}
			});
		},
		// file timestamp or null if no file
		async fileTimestamp(projFilePath) {
			try {
				var stat = await fs.promises.stat(projectPathToRealPath(projFilePath));
				return stat.mtime.getTime();
			} catch (e) {
				return null;
			}
		}
	});
}

