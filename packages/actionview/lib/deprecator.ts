import { Deprecation } from "@blazetrails/activesupport";

export { Deprecation as Deprecator };

let _deprecator: Deprecation | undefined;

export function deprecator(): Deprecation {
  return (_deprecator ??= new Deprecation());
}
