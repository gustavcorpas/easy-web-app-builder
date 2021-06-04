/* global ewaConfig ewaObjects */

/**
 * @file
 * These functions do most of the hard work related to managing the cache. A lot of other functions then use and manipulate the cache directly.
 */

import path from "path";
import fs from "fs-extra";
import { hashElement as folderHash } from "folder-hash";

import { getEWAVersion, getFolderFiles } from "./tools.js";
import { log } from "./log.js";

export default { ensure, seal };

/**
 * Ensures that the basic cache scaffolding exists and removes preexisting cache files if they fail an integrity check.
 * 
 * @returns	{object}				- 
 */
async function ensure(){

	log("Making sure the cache folder is valid");

	await fs.ensureFile(path.join(ewaConfig.cachePath, "cache-hash.json"));
	const cacheHash = await fs.readJson(path.join(ewaConfig.cachePath, "cache-hash.json"), {throws: false});

	if(
		ewaConfig.useCache === false ||
		(await generateHash(ewaConfig.cachePath)) !== cacheHash?.hash ||
		getEWAVersion() !== cacheHash?.version ||
		ewaConfig.hash !== cacheHash?.config
	){

		log("The cache folder is either missing, corrupt, outdated, or disabled by user, so overwriting it with a clean one");

		await fs.emptyDir(ewaConfig.cachePath);
		
		await Promise.all(
			[
				"items",
				"icons",
				"icons-injectables",
				"serviceworker",
			].map(folder => fs.ensureDir(path.join(ewaConfig.cachePath, folder))),
		);

	}else{
		log("The cache folder and its contents seem to be valid");
	}

	return true;


}

/**
 * Cleans unused files from the cache and "seals" it with a hash, making it possible to detect alterations to the cache when running next time.
 * 
 * @returns	{object}	- A hash of the folder.
 */
async function seal(){

	if(ewaConfig.useCache){

		log("Cleaning and sealing cache to make it ready for next run");

		await cleanUnusedFiles(path.join(ewaConfig.rootPath, ewaConfig.inputPath), ewaConfig.cachePath);

		await fs.writeJson(
			path.join(ewaConfig.cachePath, "cache-hash.json"),
			{
				"hash": (await generateHash(ewaConfig.cachePath)),
				"version": getEWAVersion(),
				"config": ewaConfig.hash,
			},
		);

	}else{

		log("User has disabled cache, so removing it");

		fs.remove(ewaConfig.cachePath);

	}

}


/**
 * Generates a standardised hash of the cache folder. Useful for integrity checks.
 * 
 * @returns	{object}				- A hash of the folder.
 * 
 */
async function generateHash(){

	return (await folderHash(
		ewaConfig.cachePath,
		{
			"files": {
				"exclude": [
					"cache-hash.json",
				],
			},
		},
	)).hash;

}

/**
 * Removes files from the cache which aren't part of the source project anymore.
 */
async function cleanUnusedFiles(){

	const cacheRemovals = [];

	for(const itemPath of getFolderFiles(path.join(ewaConfig.cachePath, "/items"))){

		const itemName = path.parse(itemPath).name.split(".")[0];

		if(!ewaObjects.minifiedHashes.includes(itemName)){
			log(`Removing minified item '${itemPath}' from cache, as it is no longer used`);
			cacheRemovals.push(
				fs.remove(path.join(ewaConfig.cachePath, "/items", itemPath)),
			);
		}

	}

	await Promise.allSettled(cacheRemovals);


}
