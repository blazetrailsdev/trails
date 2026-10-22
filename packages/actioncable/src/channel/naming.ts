import { Concern, extend, underscore } from "@blazetrails/activesupport";
import { defineModule, rbModConstSet, rbModName, rbObjClass } from "@blazetrails/ruby-compat";
import { Channel } from "../namespaces.js";

interface NamingClass {
  _channelName?: string;
}

export class ClassMethods {
  static get channelName(): string {
    const self = this as NamingClass;
    if (!Object.hasOwn(self, "_channelName")) {
      self._channelName = underscore(
        rbModName(this)!
          .replace(/Channel$/, "")
          .replaceAll("::", ":"),
      );
    }
    return self._channelName!;
  }
}

export const Naming = defineModule({
  get channelName(): string {
    return (rbObjClass(this) as unknown as { channelName: string }).channelName;
  },
});
extend(Naming, Concern);
Object.defineProperty(Naming, "ClassMethods", { value: ClassMethods });

rbModConstSet(Channel, "Naming", Naming);
