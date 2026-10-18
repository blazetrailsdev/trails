#!/usr/bin/env node
import "@blazetrails/activesupport/node";
import { binArgs, serveFromArgs } from "./server/main.js";

await serveFromArgs(binArgs());
