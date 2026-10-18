#!/usr/bin/env node
import "@blazetrails/activesupport/node";
import { binArgs, main } from "./server/main.js";

await main(binArgs());
