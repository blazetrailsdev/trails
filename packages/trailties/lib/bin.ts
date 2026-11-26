#!/usr/bin/env node
import "@blazetrails/activesupport/node";
import { Handler } from "@blazetrails/rackup";
import {
  SystemExit,
  exit,
  rbArgv,
  setExitCode,
  trap,
} from "@blazetrails/ruby-compat/process-adapter";
import { STDOUT } from "@blazetrails/ruby-compat/io";
import { AppLoader } from "./app-loader.js";
import { HELP_MAPPINGS, invoke } from "./command.js";

AppLoader.execApp();

trap("INT", () => {
  STDOUT.puts();
  exit(1);
});

try {
  const first = rbArgv()[0];
  if (first == null || first === "help" || HELP_MAPPINGS.has(first)) {
    rbArgv().shift();
    await invoke("gem_help", rbArgv());
  } else if (first === "plugin") {
    rbArgv().shift();
    await invoke("plugin", rbArgv());
  } else {
    await invoke("application", rbArgv());
  }
} catch (error) {
  if (!(error instanceof SystemExit)) throw error;
  setExitCode(error.status);
}

/** @inventedArm if — CONVERGEABLE node-handler-run-blocks-while-serving */
if (Handler.Node?.server == null) exit();
