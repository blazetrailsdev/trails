import { readWholeLate, duringInit } from "./selflate-dep.ts";
console.log("[L1] during init       =", duringInit);
console.log("[L2] after init        =", readWholeLate());
