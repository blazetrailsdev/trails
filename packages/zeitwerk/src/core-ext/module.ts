import { isModuleObject, rbObjClassname } from "@blazetrails/ruby-compat";
import { Cref } from "../cref.js";
import { Error as ZeitwerkError } from "../error.js";
import { Registry } from "../registry.js";

export function _isModule(x: unknown): x is object {
  if (typeof x === "function") {
    return Object.getOwnPropertyDescriptor(x, "prototype")?.writable === false;
  }
  return typeof x === "object" && x !== null && isModuleObject(x);
}

export async function constAdded(mod: object, cname: string): Promise<void> {
  const loader = Registry.ExplicitNamespaces.loaderFor(mod, cname);
  if (loader != null) {
    const namespace = new Cref(mod, cname).get();

    if (!_isModule(namespace)) {
      const cref = new Cref(mod, cname);
      throw new ZeitwerkError(
        `${cref} is expected to be a namespace, should be a class or module (got ${rbObjClassname(namespace)})`,
      );
    }

    await loader.onNamespaceLoaded(new Cref(mod, cname), namespace);
  }
}
