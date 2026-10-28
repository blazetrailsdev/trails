// The real shape: `class Time extends (ActiveModelTime as Initialized<typeof X, typeof Timezone>)`
// -- heritage is a parenthesized cast that MENTIONS the cycle's class in a type
// position, and the value is then used at top level.
import { BaseType } from "./ch-base.js";
import { Tz } from "./ch-tz.js";

type Initialized<B, M> = B & { __m?: M };

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type -- mirrors type/time.ts
export interface T extends Tz {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class T extends (BaseType as Initialized<typeof BaseType, typeof Tz>) {}

function useIt(mod: unknown): string {
  const p = (mod as { prototype?: unknown })?.prototype;
  return "mod=" + typeof mod + " prototype=" + typeof p;
}
console.log("[C1] include-shaped use     =", useIt(Tz));
