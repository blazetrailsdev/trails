import { Module as RbModule } from "@blazetrails/ruby-compat/include";
import { rbModMethodDefined, rbModUndefMethod } from "@blazetrails/ruby-compat/object";

type Module = { prototype: object };

export function removePossibleMethod(this: Module | RbModule, method: string): void {
  if (rbModMethodDefined(this, method)) {
    if ("prototype" in this) rbModUndefMethod(this, method);
    else this.undefMethod(method);
  }
}

export function removePossibleSingletonMethod(this: Module, method: string): void {
  removePossibleMethod.call({ prototype: this }, method);
}
