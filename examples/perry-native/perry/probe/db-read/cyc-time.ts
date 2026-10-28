// Mirrors type/time.ts: imports the class from the cycle's far side and USES
// it at module top level, exactly as `include(Time, Timezone)` does.
import { Tz } from "./cyc-tz.ts";
export class T {}
console.log("[c1] typeof Tz at top level =", typeof Tz);
function useIt(mod: unknown): string {
  const p = (mod as { prototype?: unknown })?.prototype;
  return "mod=" + typeof mod + " prototype=" + typeof p;
}
console.log("[c2] include-shaped use     =", useIt(Tz));
