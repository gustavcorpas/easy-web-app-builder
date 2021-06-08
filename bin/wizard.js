
/**
 * @file
 * t
 */

import inquirer from "inquirer";
import fileTree from "inquirer-file-tree-selection-prompt";

const prompt = inquirer.createPromptModule();
prompt.registerPrompt("file-tree", fileTree);

import chalk from "chalk";
import glob from "glob";
import deepmerge from "deepmerge";

import path from "path";
import fs from "fs-extra";

import { fileExists } from "../src/tools.js";
import scaffold from "./scaffold.js";

export default async function (){

	const p = "\n \n→";
	const s = "\n";

	console.log("");
	console.log(chalk.bgCyan.black("  Welcome to the Easy-WebApp (EWA) setup wizard  "));
	console.log(chalk.dim("This wizard covers everything a normal user needs. For advanced stuff, check this out: https://github.com/atjn/easy-webapp#advanced"));
	console.log("");
	console.log(chalk.yellow(`NOTE: Some of these operations ${chalk.underline("will overwrite files")} in your project. Make sure to back up anything important first.`));

	let allAnswers = {};

	await prompt([
		{
			name: "cleanSetup",
			type: "list",
			prefix: p, suffix: s,
			message: `What are we doing today?`,
			choices: [
				"Adding EWA to an existing project",
				"Setting up a new project from scratch",
			],
			filter: answer => Boolean(answer === "Setting up a new project from scratch"),
		},
		{
			when: answers => answers.cleanSetup,
			name: "config.inputPath",
			type: "input",
			prefix: p, suffix: s,
			message: `Which folder should we put the source files in?\n  ${chalk.dim("If you choose a folder that already exists, it will be overwritten.")}`,
			default: "source",
			filter: answer => normalizeOutputPaths(answer),
		},
		{
			when: answers => !answers.cleanSetup,
			name: "config.inputPath",
			type: "file-tree",
			onlyShowDir: true,
			onlyShowValid: true,
			prefix: p, suffix: s,
			message: `The source files for your website need to be in a folder somewhere. Which one is that?\n  ${chalk.dim("If you haven't made the folder yet, stop the wizard and do that first, then try again.")}`,
			validate: async path => Boolean(path !== process.cwd()),
			filter: answer => normalizeOutputPaths(answer),
		},
		{
			name: "config.outputPath",
			type: "input",
			prefix: p, suffix: s,
			message: `When EWA is done, it needs a folder to save the completed files in. What should we call it?\n  ${chalk.dim("If a folder already exists at the path you choose, it will be overwritten.")}`,
			default: "public",
			filter: answer => normalizeOutputPaths(answer),
		},
		{
			when: answers => Boolean(glob.sync("**/*.{html,htm}", {cwd: path.join(process.cwd(), answers.config.inputPath), absolute: true}).length === 0),
			name: "addScaffolding",
			type: "list",
			prefix: p, suffix: s,
			message: `I can't find any HTML files in your website folder. Should I paste some basic scaffolding into it?\n  ${chalk.dim("Scaffolding includes HTML, CSS, JS files and a logo.")}`,
			choices: [
				"Sounds good, give me all of it",
				"Sure, but only the HTML file",
				"No thanks",
			],
			filter: answer => {
				switch(answer){
					case "Sounds good, give me all of it":
						return "all";
					case "Sure, but only the HTML file":
						return "html";
					default:
						return "no";
				}
			},
		},
	])
	.then(answers => allAnswers = deepmerge(allAnswers, answers))
	.catch(error => handleError(error));

	allAnswers.config.fileExceptions = allAnswers.config.fileExceptions || [];

	const absoluteInputPath = path.join(process.cwd(), allAnswers.config.inputPath);
	if(allAnswers.cleanSetup){

		await fs.emptyDir(absoluteInputPath);
		await scaffold("all", absoluteInputPath);
		console.log(chalk.bold.cyan(" Great! I just added the source folder to your project and put some scaffolding files into it to help you get started."));

	}else if(allAnswers.addScaffolding === "no"){

		console.log(chalk.bold.cyan(" That's cool, just know that some things won't work until you add valid HTML file."));

	}else if(allAnswers.addScaffolding){

		await scaffold(allAnswers.addScaffolding, absoluteInputPath);
		console.log(chalk.bold.cyan(" Great! These scaffolding files should help you get started."));

	}
	console.log("");


	await prompt([
		{
			when: () => {
				const foundEnds = [];
				for(const filePath of glob.sync("**/*[-_.]{dev.*,dev,src.*,src,source.*,source}", {cwd: path.join(process.cwd(), allAnswers.config.inputPath), absolute: true})){
					const fileEnd = filePath.match(/(?<fileEnd>[-_.](?:dev|src|source)(?:\..*|$))/ui).groups.fileEnd;
					if(!foundEnds.includes(fileEnd)) foundEnds.push(fileEnd);
				}
				if(foundEnds.length === 0){
					return false;
				}else{
					allAnswers.devFileEnds = foundEnds;
					return true;
				}
			},
			name: "removeDevFiles",
			type: "checkbox",
			prefix: p, suffix: s,
			message: () => `I noticed that you have some files that, judging from their name, aren't necessary in production.\n  Should I set up rules that remove files with these endings automatically? Choose the endings to remove.`,
			choices: () => allAnswers.devFileEnds,
			filter: choices => {
				for(const choice of choices){
					allAnswers.config.fileExceptions.push({
						glob: `**/*${choice}`,
						files: {
							remove: true,
						},
					});
				}
				return choices;
			},
		},
		{
			when: () => {
				const foundExtensions = [];
				for(const filePath of glob.sync("**/*{.pcss,.scss,.less,.ts,.tsx,config,rc}", {cwd: path.join(process.cwd(), allAnswers.config.inputPath), absolute: true})){
					const extension = path.extname(filePath);
					if(!foundExtensions.includes(extension)) foundExtensions.push(extension);
				}
				if(foundExtensions.length === 0){
					return false;
				}else{
					allAnswers.unsupportedExtensions = foundExtensions;
					return true;
				}
			},
			name: "removeExtensions",
			type: "checkbox",
			prefix: p, suffix: s,
			message: () => `I noticed that your project contains some build files. (${allAnswers.unsupportedExtensions.join(", ")})\n  Maybe you have already taken this into account, but just remember that EWA doesn't support any of these files.\n  If you have a build step, I would recommend running it before EWA, then posting the output into EWAs input folder.\n  \n  Should I set up rules that remove these files automatically? Choose the ones that should be removed.`,
			choices: () => allAnswers.unsupportedExtensions,
			filter: choices => {
				for(const choice of choices){
					allAnswers.config.fileExceptions.push({
						glob: `**/*${choice}`,
						files: {
							remove: true,
						},
					});
				}
				return choices;
			},
		},
		{
			name: "config.icons.add",
			type: "list",
			prefix: p, suffix: s,
			message: `Should EWA handle your icons for you?\n  ${chalk.dim("EWA will take your icon, render it in a bunch of different sizes, then use those in the final app.")}`,
			choices: [
				"Yes",
				"No",
			],
			filter: answer => Boolean(answer === "Yes"),
		},
		{
			name: "config.files.minify",
			type: "list",
			prefix: p, suffix: s,
			message: `Should EWA minify your files?\n  ${chalk.dim("EWA will minify most files, such as HTML, CSS, JS, SVG.")}`,
			choices: [
				"Yes",
				"No",
			],
			filter: answer => Boolean(answer === "Yes"),
		},
		{
			when: answers => answers.config.files.minify,
			name: "config.files.addSourceMaps",
			type: "list",
			prefix: p, suffix: s,
			message: `Cool beans! Should the minified files include source maps?\n  ${chalk.dim("Source maps are great for debugging, but they also leak your source code to all your users.")}`,
			choices: [
				"Yes",
				"No",
			],
			filter: answer => Boolean(answer === "Yes"),
		},
		{
			name: "useDefaultConfigName",
			type: "list",
			prefix: p, suffix: s,
			message: `That was all! I will save your preferences in a file called ".ewaconfig.js". Is that cool?\n  ${chalk.dim("If you choose a different name, EWA won't be able to find the file automatically.")}`,
			choices: [
				"Yes!",
				"No, I want to call it something else",
			],
			filter: answer => Boolean(answer === "Yes!"),
		},
		{
			when: answers => !answers.useDefaultConfigName,
			name: "configName",
			type: "input",
			prefix: p, suffix: s,
			message: `Alright, what should I call it then?\n  ${chalk.dim(`When you call EWA, you'll have to use 'easy-webapp --config-name "yourconfigname"' for it to read your preferences.`)}`,
			default: "ewaconfig",
		},

	])
	.then(answers => allAnswers = deepmerge(allAnswers, answers))
	.catch(error => handleError(error));

	const configFile = `\n/**\n * @file\n * Configuration script for eay-webapp.\n */\n\nexport default ${JSON.stringify(allAnswers.config, null, 2)}\n`;
	await fs.writeFile(path.join(process.cwd(), allAnswers.useDefaultConfigName ? ".ewaconfig.js" : `.${allAnswers.configName}.js`), configFile);


}

function handleError(error){
	if(error.isTtyError){
		console.log("Sorry, but your terminal doesn't support TTY, which is required for this wizard to work. See this list to find a supported terminal: https://github.com/SBoudrias/Inquirer.js#support");
	}else{
		console.log(chalk.bgRed.black("  Sorry, something went wrong. You are welcome to file a bug with the following information at: https://github.com/atjn/easy-webapp/issues/new/choose  "));
		console.error(error);
	}
};

function validateFuzzyPath(answer){
	return answer ? true : "Please write a folder path to use. You can choose one from the list by pressing 'tab'";
}

function normalizeOutputPaths(outputPath){
	return path.isAbsolute(outputPath) ? path.relative(process.cwd(), outputPath) : outputPath;
}