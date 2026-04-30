#!/usr/bin/env node
import { argv } from "@blazetrails/activesupport/process-adapter";
import { createProgram } from "./cli.js";

const program = createProgram();
// `argv` is the process adapter's snapshot of the host argv, populated
// at activesupport's module load via the eager Node auto-register.
// Spread into a fresh mutable array since Commander expects string[].
program.parse([...argv]);
