/**
 * Named scope handling — defines named scopes on model classes
 * and registers them as static methods.
 *
 * Mirrors: ActiveRecord::Scoping::Named
 */
export class Named {
  static defineScope(
    modelClass: any,
    name: string,
    fn: (rel: any, ...args: any[]) => any,
    extension?: Record<string, Function>,
  ): void {
    if (!Object.prototype.hasOwnProperty.call(modelClass, "_scopes")) {
      modelClass._scopes = new Map(modelClass._scopes);
    }
    modelClass._scopes.set(name, fn);

    if (extension) {
      if (!Object.prototype.hasOwnProperty.call(modelClass, "_scopeExtensions")) {
        modelClass._scopeExtensions = new Map(modelClass._scopeExtensions);
      }
      modelClass._scopeExtensions.set(name, extension);
    }

    Object.defineProperty(modelClass, name, {
      value: function (...args: any[]) {
        return (this as any).all()[name](...args);
      },
      writable: true,
      configurable: true,
    });
  }
}
