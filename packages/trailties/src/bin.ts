#!/usr/bin/env node
import "@blazetrails/activesupport/node";
import { getFs, getPath } from "@blazetrails/ruby-compat";
import { Dir, argv } from "@blazetrails/ruby-compat";
import { setAppPath } from "./app-path.js";
import { invoke } from "./command.js";

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

const [, , command = "", ...args] = argv;
await invoke(command, args);
