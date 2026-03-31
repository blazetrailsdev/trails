/**
 * ActionController::Railtie
 *
 * Railtie for ActionController. Hooks into app initialization to
 * configure controllers, set up middlewares, and register log subscribers.
 * @see https://api.rubyonrails.org/classes/ActionController/Railtie.html
 */

export class Railtie {
  static railtieName = "action_controller";

  private _initializers: Array<{ name: string; fn: () => void }> = [];

  initializer(name: string, fn: () => void): void {
    this._initializers.push({ name, fn });
  }

  runInitializers(): void {
    for (const init of this._initializers) {
      init.fn();
    }
  }

  get initializers(): ReadonlyArray<{ name: string; fn: () => void }> {
    return [...this._initializers];
  }
}
