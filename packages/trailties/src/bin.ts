#!/usr/bin/env node
import "@blazetrails/activesupport/node";
import { getFsAsync, getPathAsync } from "@blazetrails/activesupport";
import { argv, cwd } from "@blazetrails/activesupport/process-adapter";
import { setAppPath } from "./app-path.js";
import { createProgram } from "./cli.js";
import { Generators } from "./generators.js";

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

// Rails runs `lookup!` lazily from `Generators.help`/`find_by_namespace`;
// commander needs the subcommand tree before `parse`, so the scan is warmed
// here — this is the one place with a top-level `await` to spend on it.
await Generators.lookupBang();

const program = createProgram();
// `argv` is the process adapter's snapshot of the host argv, populated
// at activesupport's module load via the eager Node auto-register.
// Spread into a fresh mutable array since Commander expects string[].
await program.parseAsync([...argv]);
