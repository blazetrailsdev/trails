#!/usr/bin/env node
import "@blazetrails/activesupport/node";
import { getFs, getPath } from "@blazetrails/ruby-compat";
import { Dir, argv } from "@blazetrails/ruby-compat";
import { APP_PATH, setAppPath } from "./app-path.js";
import { invoke } from "./command.js";
import { aliases } from "./commands.js";
import "./class-paths.generated.js";

if (APP_PATH == null) {
  const root = Dir.pwd();
  const fs = getFs();
  const p = getPath();
  for (const candidate of [
    p.join(root, "dist", "config", "application.js"),
    p.join(root, "config", "application.ts"),
  ]) {
    if (await fs.exists(candidate)) {
      setAppPath(candidate);
      break;
    }
  }
}

const aliases: Record<string, string> = {
  g: "generate",
  d: "destroy",
  c: "console",
  s: "server",
  r: "runner",
  t: "test",
};

const [, , command = "", ...args] = argv;
await invoke(Object.hasOwn(aliases, command) ? aliases[command] : command, args);
