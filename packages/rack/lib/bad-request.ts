import { isModuleIncluded } from "@blazetrails/ruby-compat";

export const BadRequest = {
  [Symbol.hasInstance](value: unknown): boolean {
    const klass = (value as object | null | undefined)?.constructor as
      | { prototype: object }
      | undefined;
    return klass?.prototype != null && isModuleIncluded(klass, BadRequest);
  },
};
