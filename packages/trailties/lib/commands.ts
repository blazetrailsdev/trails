import "@blazetrails/activesupport/node";
import { SystemExit, rbArgv, setExitCode } from "@blazetrails/ruby-compat";
import { invoke } from "./command.js";
import "./constants.generated.js";

const aliases: Readonly<Record<string, string>> = {
  g: "generate",
  d: "destroy",
  c: "console",
  s: "server",
  db: "dbconsole",
  r: "runner",
  t: "test",
};

let command = rbArgv().shift() ?? "";
command = (Object.hasOwn(aliases, command) ? aliases[command] : undefined) ?? command;

try {
  await invoke(command, rbArgv());
} catch (error) {
  if (!(error instanceof SystemExit)) throw error;
  setExitCode(error.status);
}
