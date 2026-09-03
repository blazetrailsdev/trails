#!/usr/bin/env node
import "@blazetrails/activesupport/node";
import { getFsAsync, getPathAsync } from "@blazetrails/ruby-compat";
import { Dir, argv } from "@blazetrails/ruby-compat";
import { setAppPath } from "./app-path.js";
import { createProgram } from "./cli.js";
import { Generators } from "./generators.js";

const root = Dir.pwd();
const fs = await getFsAsync();
const p = await getPathAsync();
for (const candidate of [
  p.join(root, "dist", "config", "application.js"),
  p.join(root, "config", "application.ts"),
]) {
  if (await fs.exists(candidate)) {
    setAppPath(candidate);
    break;
  }
}

await Generators.lookupBang();

const program = createProgram();
await program.parseAsync([...argv]);
