import { rbObjInstanceVariables, rbObjIvarGet } from "@blazetrails/ruby-compat";

export class Object {
  static instanceValues(self: object): Record<string, unknown> {
    return globalThis.Object.fromEntries(
      rbObjInstanceVariables(self).map((ivar) => [ivar.slice(1), rbObjIvarGet(self, ivar)]),
    );
  }

  static instanceVariableNames(self: object): string[] {
    return rbObjInstanceVariables(self);
  }
}
