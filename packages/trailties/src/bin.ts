#!/usr/bin/env node
import "@blazetrails/activesupport/node";
import { SystemExit, argv, setExitCode } from "@blazetrails/ruby-compat";
import { AppLoader } from "./app-loader.js";
import { invoke } from "./command.js";
import { aliases } from "./commands.js";
import "./constants.generated.js";

AppLoader.execApp();

const [, , command = "", ...args] = argv;
try {
  await invoke(Object.hasOwn(aliases, command) ? aliases[command] : command, args);
} catch (error) {
  if (!(error instanceof SystemExit)) throw error;
  setExitCode(error.status);
}
