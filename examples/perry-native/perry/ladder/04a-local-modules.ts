// Control for rung 04: a multi-file module graph with no package import, to
// separate "Perry struggles with imports" from "Perry struggles with the size
// of a @blazetrails package".
import { camelize } from "./local-inflector.js";
console.log(`[04a] ${camelize("trail_name")}`);
