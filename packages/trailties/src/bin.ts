#!/usr/bin/env node
import "@blazetrails/activesupport/node";
import { AppLoader } from "./app-loader.js";

AppLoader.execApp();

await import("./commands.js");
