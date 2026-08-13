#!/usr/bin/env node
import { argv } from "@blazetrails/activesupport/process-adapter";
import { getChildProcessAsync } from "@blazetrails/activesupport/child-process-adapter";
import { createProgram } from "./cli.js";

// The sync auto-register in activesupport's child-process adapter only works
// under CommonJS. This bin runs as pure ESM, so prime the registry through the
// async path before any command can reach for `spawnSync` (`trails new`
// shelling out to the package manager, `trails db:*` to the database CLIs).
await getChildProcessAsync();

const program = createProgram();
// `argv` is the process adapter's snapshot of the host argv, populated
// at activesupport's module load via the eager Node auto-register.
// Spread into a fresh mutable array since Commander expects string[].
program.parse([...argv]);
