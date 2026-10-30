import {
  rbCallSuper,
  rbObjClone,
  rbObjInstanceVariables,
  rbObjIvarGet,
  rbObjIvarSet,
} from "@blazetrails/ruby-compat";

export const Cloneable = {
  initializeCopy(this: object, source: object): void {
    rbCallSuper(this, Cloneable.initializeCopy, source);
    for (const varName of rbObjInstanceVariables(source)) {
      const srcValue = rbObjIvarGet(source, varName);
      let value: unknown;
      try {
        value = rbObjClone(srcValue);
      } catch {
        value = srcValue;
      }
      rbObjIvarSet(this, varName, value);
    }
  },
};
