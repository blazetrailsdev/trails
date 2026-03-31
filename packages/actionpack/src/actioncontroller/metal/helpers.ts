/**
 * ActionController::Helpers
 *
 * View helper inclusion for controllers. Provides the `helpers` proxy
 * and `helper_method` for exposing controller methods to views.
 * @see https://api.rubyonrails.org/classes/ActionController/Helpers.html
 */

export class HelperRegistry {
  private _methods = new Map<string, (...args: unknown[]) => unknown>();
  private _modules: unknown[] = [];

  helperMethod(name: string, fn: (...args: unknown[]) => unknown): void {
    this._methods.set(name, fn);
  }

  helper(mod: unknown): void {
    this._modules.push(mod);
  }

  getMethods(): ReadonlyMap<string, (...args: unknown[]) => unknown> {
    return new Map(this._methods);
  }

  getModules(): readonly unknown[] {
    return [...this._modules];
  }

  buildHelpers(controller: Record<string, unknown>): Record<string, unknown> {
    const helpers: Record<string, unknown> = {};
    for (const [name, fn] of this._methods) {
      helpers[name] = fn.bind(controller);
    }
    return helpers;
  }
}
