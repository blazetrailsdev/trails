import { Deprecation } from "@blazetrails/activesupport";
import { deprecator as abstractDeprecator } from "../abstract-controller/deprecator.js";

export { Deprecation as Deprecator };

export function deprecator(): Deprecation {
  return abstractDeprecator();
}
