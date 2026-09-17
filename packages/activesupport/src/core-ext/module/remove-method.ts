type Module = { prototype: object };

export function removePossibleMethod(this: Module, method: string): void {
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
