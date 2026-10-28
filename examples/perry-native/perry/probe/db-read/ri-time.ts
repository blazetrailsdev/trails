// mirrors packages/activerecord/src/type/time.ts: the real include() at top level
import { include } from "@blazetrails/activesupport";
import { Timezone } from "./ri-tz.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type -- mirrors the real file
export interface Time extends Timezone {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Time {}

console.log("[R1] Timezone at include site =", typeof Timezone);
include(Time, Timezone);
console.log("[R2] include(Time, Timezone)  = survived");
