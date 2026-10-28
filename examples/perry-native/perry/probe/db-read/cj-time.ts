import { Tz } from "./cj-tz.js";
export class T {}
console.log("[A1] typeof Tz at top level =", typeof Tz);
console.log("[A2] Tz.prototype           =", typeof (Tz as { prototype?: unknown })?.prototype);
