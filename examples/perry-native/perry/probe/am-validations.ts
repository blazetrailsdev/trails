// Wall 8's failing site in isolation: activemodel's validations.ts does
// `const SuperMethods = new Module((mod) => mod.defineMethod(...))` at module
// init, with `Module` imported across a package boundary from the ruby-compat
// barrel. ruby-compat's own `Kernel` does the same thing with the local class
// and succeeds, so this probe asks whether the barrel-imported construction
// fails on its own, in a graph far smaller than 05-model's 1146 modules.
import { ValidationError } from "@blazetrails/activemodel";

console.log("[am-validations]", typeof ValidationError);
