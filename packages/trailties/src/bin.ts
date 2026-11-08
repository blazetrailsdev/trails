#!/usr/bin/env node
import "@blazetrails/activesupport/node";
import { SystemExit, exit, rbArgv, setExitCode, STDOUT, trap } from "@blazetrails/ruby-compat";
import { AppLoader } from "./app-loader.js";

AppLoader.execApp();

trap("INT", () => {
  STDOUT.puts();
  exit(1);
});

const { HELP_MAPPINGS, invoke } = await import("./command.js");
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
