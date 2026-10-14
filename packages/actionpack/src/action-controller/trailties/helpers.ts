import type { HelpersClass, HelpersClassMethods } from "../../abstract-controller/helpers.js";
import { moduleParents } from "@blazetrails/activesupport";
import { rbObjRespondTo } from "@blazetrails/ruby-compat";
import { helpersPath } from "../metal/helpers.js";
import { ActionController } from "../../namespaces.js";

export interface HelpersPathControllerClass extends HelpersClassMethods {
  helpersPath?: string[];
  includeAllHelpers?: boolean;
  helper?: HelpersClass["helper"];
}

export async function inherited(klass: HelpersPathControllerClass): Promise<void> {
  if (!rbObjRespondTo(klass, "helpersPath=")) return;

  let paths: string[];
  const namespace = moduleParents(klass).find((m) => rbObjRespondTo(m, "trailtieHelpersPaths"));
  if (namespace != null) {
    paths = await (
      namespace as { trailtieHelpersPaths(): Promise<string[]> }
    ).trailtieHelpersPaths();
  } else {
    paths = helpersPath();
  }

  klass.helpersPath = paths;

  const base = ActionController.Base as unknown as HelpersPathControllerClass;
  if (Object.getPrototypeOf(klass) === base && base.includeAllHelpers) {
    (klass as HelpersClass).helper(":all");
  }
}
