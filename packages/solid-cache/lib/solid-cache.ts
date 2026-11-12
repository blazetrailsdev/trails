import { mattrAccessor } from "@blazetrails/activesupport";
import { TopLevel } from "@blazetrails/ruby-compat";
import type { MaglevHash } from "./maglev-hash.js";

export const SolidCache = {
  name: "SolidCache",
} as {
  name: "SolidCache";
  executor: unknown;
  MaglevHash?: typeof MaglevHash;
};

mattrAccessor.call(SolidCache, "executor");

TopLevel.SolidCache = SolidCache;

declare module "@blazetrails/ruby-compat" {
  interface TopLevelConstants {
    SolidCache?: typeof SolidCache;
  }
}
