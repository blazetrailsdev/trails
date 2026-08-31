#!/usr/bin/env node
import "@blazetrails/activesupport/node";
import { getFsAsync, getPathAsync } from "@blazetrails/activesupport";
import { argv, cwd } from "@blazetrails/activesupport/process-adapter";
import { setAppPath } from "./app-path.js";
import { createProgram } from "./cli.js";

// Rails' `bin/rails` line `APP_PATH = File.expand_path("../config/application", __dir__)`.
// A trails app ships TypeScript sources and a compiled `dist/`, so the entry
// point picks the spelling — `require_application!` then names one path, the
// way `Rails::Command::Actions` does.
const root = cwd();
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

const program = createProgram();
// `argv` is the process adapter's snapshot of the host argv, populated
// at activesupport's module load via the eager Node auto-register.
// Spread into a fresh mutable array since Commander expects string[].
program.parse([...argv]);
