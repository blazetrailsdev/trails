// The real failing module, imported DIRECTLY by relative path -- no barrel.
// If include(Time, Timezone) still gets undefined here, the module count is
// far smaller and this is the repro to shrink.
import { Time } from "../../../../../packages/activerecord/src/type/time.ts";

console.log("[d1] Time              =", typeof Time);
console.log("[d2] Time.prototype    =", typeof (Time as { prototype?: unknown })?.prototype);
