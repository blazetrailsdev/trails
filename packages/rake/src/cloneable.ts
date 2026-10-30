import { rbObjClone } from "@blazetrails/ruby-compat";

export const Cloneable = {
  initializeCopy(this: object, source: object): void {
    for (const [varName, srcValue] of Object.entries(source)) {
      let value: unknown;
      try {
        value = rbObjClone(srcValue);
      } catch {
        value = srcValue;
      }
      (this as Record<string, unknown>)[varName] = value;
    }
  },
};
