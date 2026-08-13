#!/usr/bin/env node
import { argv } from "@blazetrails/activesupport/process-adapter";
import { getChildProcessAsync } from "@blazetrails/activesupport/child-process-adapter";
import { getCryptoAsync } from "@blazetrails/activesupport/crypto-adapter";
import { createProgram } from "./cli.js";

// activesupport's adapters only self-register synchronously under CommonJS.
// This bin runs as pure ESM, so prime them through the async path before any
// command can reach for the sync getters:
//
//   child process — `trails new` shelling out to the package manager,
//                   `trails db:*` to the database CLIs.
//   crypto        — index and foreign-key name digests, so a migration using
//                   `t.references(..., { foreignKey: true })` can run.
await Promise.all([getChildProcessAsync(), getCryptoAsync()]);

const program = createProgram();
// `argv` is the process adapter's snapshot of the host argv, populated
// at activesupport's module load via the eager Node auto-register.
// Spread into a fresh mutable array since Commander expects string[].
program.parse([...argv]);
