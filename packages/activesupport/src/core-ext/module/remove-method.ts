type Module = { prototype: object };

export function removePossibleMethod(this: Module, method: string): void {
  if (method in this.prototype) {
    delete (this.prototype as Record<string, unknown>)[method];
  }
}

export function removePossibleSingletonMethod(this: Module, method: string): void {
  removePossibleMethod.call({ prototype: this }, method);
}
