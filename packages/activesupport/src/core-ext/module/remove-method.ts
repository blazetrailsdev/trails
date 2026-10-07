import { Module as RbModule } from "@blazetrails/ruby-compat";

type Module = { prototype: object };

export function removePossibleMethod(this: Module | RbModule, method: string): void {
  if (this instanceof RbModule) {
    if (this.isMethodDefined(method)) this.undefMethod(method);
    return;
  }
  if (method in this.prototype) {
    Object.defineProperty(this.prototype, method, {
      value: undefined,
      writable: true,
      configurable: true,
      enumerable: false,
    });
  }
}

export function removePossibleSingletonMethod(this: Module, method: string): void {
  removePossibleMethod.call({ prototype: this }, method);
}
