import { Deprecation } from "./deprecation.js";

export function deprecator(): Deprecation {
  return Deprecation._instance();
}
