import { isModuleObject, rbObjClassname } from "@blazetrails/ruby-compat";
import { Cref } from "../cref.js";
import { Error as ZeitwerkError } from "../error.js";
import { Registry } from "../registry.js";

export async function constAdded(mod: object, cname: string): Promise<void> {
  const loader = Registry.ExplicitNamespaces.loaderFor(mod, cname);
  if (loader != null) {
    const cref = new Cref(mod, cname);
    const namespace = cref.get();

    if (
      typeof namespace !== "function" &&
      !(typeof namespace === "object" && namespace !== null && isModuleObject(namespace))
    ) {
      throw new ZeitwerkError(
        `${cref} is expected to be a namespace, should be a class or module (got ${rbObjClassname(namespace)})`,
      );
    }

    await loader.onNamespaceLoaded(cref, namespace);
  }
}
