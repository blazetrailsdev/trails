/**
 * AbstractController::Base
 *
 * Foundation for all controllers. Provides action dispatching,
 * callbacks, and format collection.
 */

export type ActionCallback = (
  controller: AbstractController,
) => void | Promise<void> | boolean | Promise<boolean>;
export type AroundCallback = (
  controller: AbstractController,
  next: () => Promise<void>,
) => void | Promise<void>;

export interface CallbackOptions {
  only?: string[];
  except?: string[];
  if?: (controller: AbstractController) => boolean;
  unless?: (controller: AbstractController) => boolean;
  prepend?: boolean;
}

interface CallbackEntry {
  callback: ActionCallback | AroundCallback;
  type: "before" | "after" | "around";
  options: CallbackOptions;
}

export class AbstractController {
  /** The action currently being processed. */
  actionName: string = "";

  /** Response body. */
  responseBody: string | Buffer | null = null;

  /** Whether a response has been committed (render/redirect called). */
  private _performed: boolean = false;

  /** Registered callbacks (class-level, inherited). */
  private static _callbacks: CallbackEntry[] = [];

  /** Skipped callback identifiers. */
  private static _skippedCallbacks: Array<{
    callback: ActionCallback | AroundCallback;
    options: CallbackOptions;
  }> = [];

  /** Available actions. Override in subclasses. */
  static actionMethods(): string[] {
    const proto = this.prototype;
    const methods: string[] = [];
    const excluded = new Set(["constructor", "processAction", "availableActions"]);
    let current = proto;
    while (current && current !== Object.prototype) {
      for (const name of Object.getOwnPropertyNames(current)) {
        if (
          typeof (current as any)[name] === "function" &&
          !name.startsWith("_") &&
          !excluded.has(name)
        ) {
          methods.push(name);
        }
      }
      current = Object.getPrototypeOf(current);
    }
    return [...new Set(methods)];
  }

  /** Check if an action exists. */
  static hasAction(action: string): boolean {
    return this.actionMethods().includes(action);
  }

  /** Register a before_action callback. */
  static beforeAction(callback: ActionCallback, options: CallbackOptions = {}): void {
    const entry: CallbackEntry = { callback, type: "before", options };
    if (options.prepend) {
      this._ensureOwnCallbacks().unshift(entry);
    } else {
      this._ensureOwnCallbacks().push(entry);
    }
  }

  /** Register an after_action callback. */
  static afterAction(callback: ActionCallback, options: CallbackOptions = {}): void {
    const entry: CallbackEntry = { callback, type: "after", options };
    if (options.prepend) {
      this._ensureOwnCallbacks().unshift(entry);
    } else {
      this._ensureOwnCallbacks().push(entry);
    }
  }

  /** Register an around_action callback. */
  static aroundAction(callback: AroundCallback, options: CallbackOptions = {}): void {
    const entry: CallbackEntry = { callback, type: "around", options };
    if (options.prepend) {
      this._ensureOwnCallbacks().unshift(entry);
    } else {
      this._ensureOwnCallbacks().push(entry);
    }
  }

  /** Skip a previously registered before_action. */
  static skipBeforeAction(callback: ActionCallback, options: CallbackOptions = {}): void {
    this._ensureOwnSkipped().push({ callback, options });
  }

  /** Get all callbacks including inherited ones. */
  static getCallbacks(): CallbackEntry[] {
    const chain: CallbackEntry[] = [];
    const hierarchy = this._getHierarchy();
    for (const klass of hierarchy) {
      if (Object.prototype.hasOwnProperty.call(klass, "_callbacks")) {
        chain.push(...(klass as any)._callbacks);
      }
    }
    return chain;
  }

  /** Get all skipped callbacks. */
  static getSkipped(): Array<{
    callback: ActionCallback | AroundCallback;
    options: CallbackOptions;
  }> {
    const skipped: Array<{ callback: ActionCallback | AroundCallback; options: CallbackOptions }> =
      [];
    const hierarchy = this._getHierarchy();
    for (const klass of hierarchy) {
      if (Object.prototype.hasOwnProperty.call(klass, "_skippedCallbacks")) {
        skipped.push(...(klass as any)._skippedCallbacks);
      }
    }
    return skipped;
  }

  /** Process an action by name. Runs callbacks around the action. */
  async processAction(action: string): Promise<void> {
    this.actionName = action;
    this._performed = false;

    const Constructor = this.constructor as typeof AbstractController;
    const allCallbacks = Constructor.getCallbacks();
    const skipped = Constructor.getSkipped();

    // Filter out skipped callbacks
    const callbacks = allCallbacks.filter((entry) => {
      return !skipped.some((s) => {
        if (s.callback !== entry.callback) return false;
        if (s.options.only && !s.options.only.includes(action)) return false;
        if (s.options.except && s.options.except.includes(action)) return false;
        return true;
      });
    });

    const befores = callbacks.filter((c) => c.type === "before" && this._shouldRun(c, action));
    const afters = callbacks.filter((c) => c.type === "after" && this._shouldRun(c, action));
    const arounds = callbacks.filter((c) => c.type === "around" && this._shouldRun(c, action));

    // Build the around chain
    const executeAction = async (): Promise<void> => {
      // Run before callbacks
      for (const entry of befores) {
        if (this._performed) return;
        const result = await (entry.callback as ActionCallback)(this);
        if (result === false) return; // Halt chain
      }

      if (this._performed) return;

      // Execute the action
      const method = (this as any)[action];
      if (typeof method === "function") {
        await method.call(this);
      } else {
        throw new ActionNotFound(
          `The action '${action}' could not be found for ${this.constructor.name}`,
        );
      }

      // Run after callbacks (in reverse order)
      for (const entry of afters.reverse()) {
        await (entry.callback as ActionCallback)(this);
      }
    };

    // Wrap with around callbacks
    let chain = executeAction;
    for (const around of arounds.reverse()) {
      const inner = chain;
      chain = async () => {
        await (around.callback as AroundCallback)(this, inner);
      };
    }

    await chain();
  }

  /** Whether a render or redirect has been performed. */
  get performed(): boolean {
    return this._performed;
  }

  /** Mark the response as performed. */
  protected markPerformed(): void {
    this._performed = true;
  }

  /** Get available action names. */
  availableActions(): string[] {
    return (this.constructor as typeof AbstractController).actionMethods();
  }

  private _shouldRun(entry: CallbackEntry, action: string): boolean {
    const opts = entry.options;
    if (opts.only && !opts.only.includes(action)) return false;
    if (opts.except && opts.except.includes(action)) return false;
    if (opts.if && !opts.if(this)) return false;
    if (opts.unless && opts.unless(this)) return false;
    return true;
  }

  private static _ensureOwnCallbacks(): CallbackEntry[] {
    if (!Object.prototype.hasOwnProperty.call(this, "_callbacks")) {
      (this as any)._callbacks = [];
    }
    return (this as any)._callbacks;
  }

  private static _ensureOwnSkipped(): Array<{
    callback: ActionCallback | AroundCallback;
    options: CallbackOptions;
  }> {
    if (!Object.prototype.hasOwnProperty.call(this, "_skippedCallbacks")) {
      (this as any)._skippedCallbacks = [];
    }
    return (this as any)._skippedCallbacks;
  }

  private static _getHierarchy(): Array<typeof AbstractController> {
    const chain: Array<typeof AbstractController> = [];
    let klass = this as typeof AbstractController;
    while (klass && klass !== (Object as unknown)) {
      chain.unshift(klass);
      klass = Object.getPrototypeOf(klass);
    }
    return chain;
  }
}

export class ActionNotFound extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ActionNotFound";
  }
}
