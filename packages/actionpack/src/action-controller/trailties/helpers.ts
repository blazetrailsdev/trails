import type { HelpersClass, HelpersClassMethods } from "../../abstract-controller/helpers.js";
import { helpersPath } from "../metal/helpers.js";
import { ActionController } from "../../namespaces.js";

export interface HelpersPathControllerClass extends HelpersClassMethods {
  helpersPath?: string[];
  includeAllHelpers?: boolean;
  helper?: HelpersClass["helper"];
}

export function inherited(klass: HelpersPathControllerClass): void {
  if (!("helpersPath" in klass)) return;

  klass.helpersPath = helpersPath();

  const base = ActionController.Base as unknown as HelpersPathControllerClass;
  if (Object.getPrototypeOf(klass) === base && base.includeAllHelpers) {
    (klass as HelpersClass).helper(":all");
  }
}
