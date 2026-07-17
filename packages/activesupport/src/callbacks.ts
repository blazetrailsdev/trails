export type CallbackKind = "before" | "after" | "around";

/**
 * Identity-checked abort sentinel — the faithful port of Ruby's `throw :abort`.
 *
 * Modern Rails (5+) halts a before-callback chain via non-local control flow
 * (`throw(:abort)` caught by the default terminator's `catch(:abort)`), NOT by
 * returning `false`. JavaScript has no catch/throw, so we model it with a
 * dedicated symbol thrown by {@link throwAbort} and caught **by identity** in
 * the before-callback runner. A bare `throw "abort"` is deliberately NOT
 * recognized — catching strings risks swallowing genuine errors.
 *
 * Relationship to `return false`: returning `false` from a before callback does
 * NOT halt the chain. Modern Rails (5+) ignores a `false` return entirely; the
 * default terminator halts ONLY on `throw :abort`. The sentinel is the sole halt
 * mechanism — any other thrown value (Error subclasses, etc.) propagates
 * unchanged, matching Rails' `raise`-in-callback semantics.
 */
const ABORT = Symbol("blazetrails.activesupport.callbacks.abort");

/** Halt the running before-callback chain — the port of Ruby `throw :abort`. */
export function throwAbort(): never {
  throw ABORT;
}

/** True iff `e` is the abort sentinel thrown by {@link throwAbort} (identity). */
export function isAbortSignal(e: unknown): boolean {
  return e === ABORT;
}

// Mirrors Rails conditions, which receive `(target, value)` — `value` is the
// callback chain's `env.value` (the run_callbacks block's return). Most
// conditions only look at `target`; ActiveModel's after-model-callback
// conditional (`v != false`, define_model_callbacks) reads `value`.
export type CallbackCondition<T extends object = object> = (target: T, value?: unknown) => boolean;

export interface CallbackOptions<T extends object = object> {
  if?: CallbackCondition<T> | CallbackCondition<T>[];
  unless?: CallbackCondition<T> | CallbackCondition<T>[];
  prepend?: boolean;
}

export interface DefineCallbacksOptions<T extends object = object> {
  /**
   * Mirrors Rails' :terminator option. Pass a function `(target, fn) => boolean` (returns true
   * to halt) or `false` to disable halting entirely. With the default terminator a before
   * callback halts the chain ONLY by throwing the abort sentinel ({@link throwAbort} — the
   * faithful port of Ruby `throw :abort`), matching Rails 5+ default_terminator. A `false`
   * return does NOT halt. Any other thrown value propagates unchanged.
   *
   * **Async constraint**: async before callbacks (those returning a Promise) are only supported
   * with the default terminator. Registering a custom terminator function and then running an
   * async before callback throws at runtime, because the terminator would receive a Promise
   * rather than the resolved callback result and cannot make a correct halt decision.
   */
  terminator?: ((target: T, fn: () => unknown) => boolean) | false;
  skipAfterCallbacksIfTerminated?: boolean;
  scope?: string[];
}

export type BeforeCallback<T extends object = object> = (target: T) => unknown;

export type AfterCallback<T extends object = object> = (target: T) => unknown;

export type AroundCallback<T extends object = object> = (
  target: T,
  next: () => void | Promise<void>,
) => void | Promise<void>;
export type AnyCallback<T extends object = object> =
  | BeforeCallback<T>
  | AfterCallback<T>
  | AroundCallback<T>;

/**
 * Object form for callbacks. Mirrors Rails' object-callback dispatch: the object
 * compiles to a {@link ObjectCall} CallTemplate whose method name is the
 * callback's `currentScopes().join` (camelCased). With the default chain scope
 * `[:kind]` the object must implement the bare kind method — `before`, `after`,
 * or `around`; with `scope: ["kind", "name"]` it implements `beforeSave`,
 * `afterSave`, or `aroundSave` for an event named `"save"`.
 *
 * @example
 * ```ts
 * const logger = {
 *   before(record: MyModel) { console.log("saving", record); },
 *   after(record: MyModel)  { console.log("saved",  record); },
 * };
 * setCallback(target, "save", "before", logger);
 * setCallback(target, "save", "after",  logger);
 * ```
 */
export type CallbackObject = { [key: string]: unknown };

export interface RunCallbacksOptions {
  /** If "sync", throw when any callback or block returns a Promise. */
  strict?: "sync";
}

function isThenable(v: unknown): v is PromiseLike<unknown> {
  return (
    v !== null &&
    (typeof v === "object" || typeof v === "function") &&
    typeof (v as { then?: unknown }).then === "function"
  );
}

/**
 * Consume a thenable's rejection before re-throwing in strict-sync mode so the
 * error we throw isn't accompanied by an unhandled-rejection warning.
 */
function swallowRejection(v: unknown): void {
  if (isThenable(v)) void Promise.resolve(v).catch(() => {});
}

// ---------------------------------------------------------------------------
// Conditionals
// ---------------------------------------------------------------------------

/** Mirrors: ActiveSupport::Callbacks::Conditionals::Value */
export class Value {
  private readonly block: (value: unknown) => unknown;

  constructor(block: (value: unknown) => unknown) {
    this.block = block;
  }

  call(_target: object, value: unknown): unknown {
    return this.block(value);
  }

  static check(options: CallbackOptions, target: object, value?: unknown): boolean {
    if (options.if) {
      const conditions = Array.isArray(options.if) ? options.if : [options.if];
      if (!conditions.every((cond) => cond(target, value))) return false;
    }
    if (options.unless) {
      const conditions = Array.isArray(options.unless) ? options.unless : [options.unless];
      if (conditions.some((cond) => cond(target, value))) return false;
    }
    return true;
  }
}

// ---------------------------------------------------------------------------
// CallTemplate — protocol for wrapping callables
// ---------------------------------------------------------------------------

/** Mirrors: ActiveSupport::Callbacks::CallTemplate */
export interface CallTemplate {
  expand(target: object, value: unknown, block: (() => unknown) | null): unknown[];
  // Rails make_lambda yields `|target, value, &block|`; the trailing block is the
  // around continuation, threaded so InstanceExec2/ProcCall can forward it.
  makeLambda(): (target: object, value: unknown, block?: (() => unknown) | null) => unknown;
  invertedLambda(): (target: object, value: unknown, block?: (() => unknown) | null) => boolean;
}

/** Mirrors: ActiveSupport::Callbacks::CallTemplate::MethodCall */
export class MethodCall implements CallTemplate {
  constructor(readonly methodName: PropertyKey) {}

  expand(target: object, _value: unknown, block: (() => unknown) | null): unknown[] {
    return [target, block, this.methodName];
  }

  makeLambda(): (target: object, value: unknown) => unknown {
    const m = this.methodName;
    return (target: object) =>
      ((target as Record<PropertyKey, unknown>)[m] as (() => unknown) | undefined)?.();
  }

  invertedLambda(): (target: object, value: unknown) => boolean {
    const m = this.methodName;
    return (target: object) =>
      !((target as Record<PropertyKey, unknown>)[m] as (() => unknown) | undefined)?.();
  }

  make(target: object, _value: unknown): unknown {
    const t = target as Record<PropertyKey, unknown>;
    return (t[this.methodName] as ((this: unknown) => unknown) | undefined)?.call(target);
  }
}

/** Mirrors: ActiveSupport::Callbacks::CallTemplate::ObjectCall */
export class ObjectCall implements CallTemplate {
  constructor(
    readonly target: object | null,
    readonly methodName: string,
  ) {}

  expand(target: object, _value: unknown, block: (() => unknown) | null): unknown[] {
    return [this.target ?? target, block, this.methodName, target];
  }

  makeLambda(): (target: object, value: unknown) => unknown {
    const ot = this.target;
    const m = this.methodName;
    // Rails ObjectCall#make_lambda: `(@override_target || target).send(@method_name, target)`
    // — `send` binds `self` to the receiver, so call with `this` = receiver.
    return (target: object) => {
      const receiver = (ot ?? target) as Record<string, unknown>;
      return (receiver[m] as ((this: unknown, arg: object) => unknown) | undefined)?.call(
        receiver,
        target,
      );
    };
  }

  invertedLambda(): (target: object, value: unknown) => boolean {
    const ot = this.target;
    const m = this.methodName;
    return (target: object) => {
      const receiver = (ot ?? target) as Record<string, unknown>;
      return !(receiver[m] as ((this: unknown, arg: object) => unknown) | undefined)?.call(
        receiver,
        target,
      );
    };
  }

  make(instance: object, _value: unknown): unknown {
    const t = (this.target ?? instance) as Record<string, unknown>;
    return (t[this.methodName] as ((this: unknown, arg: object) => unknown) | undefined)?.call(
      t,
      instance,
    );
  }
}

/** Mirrors: ActiveSupport::Callbacks::CallTemplate::InstanceExec0 */
export class InstanceExec0 implements CallTemplate {
  constructor(readonly fn: () => unknown) {}

  expand(target: object, _value: unknown, block: (() => unknown) | null): unknown[] {
    return [target, this.fn, "instanceExec"];
  }

  makeLambda(): (target: object, value: unknown) => unknown {
    const f = this.fn;
    return (target: object) => f.call(target);
  }

  invertedLambda(): (target: object, value: unknown) => boolean {
    const f = this.fn;
    return (target: object) => !f.call(target);
  }

  make(target: object, _value: unknown): unknown {
    return this.fn.call(target);
  }
}

/** Mirrors: ActiveSupport::Callbacks::CallTemplate::InstanceExec1 */
export class InstanceExec1 implements CallTemplate {
  constructor(readonly fn: (target: object) => unknown) {}

  expand(target: object, _value: unknown, block: (() => unknown) | null): unknown[] {
    return [target, this.fn, "instanceExec", target];
  }

  makeLambda(): (target: object, value: unknown) => unknown {
    const f = this.fn;
    // Rails: target.instance_exec(target, &block) — self IS the record and the
    // record is also yielded as the block arg. Bind `this` to target.
    return (target: object) => f.call(target, target);
  }

  invertedLambda(): (target: object, value: unknown) => boolean {
    const f = this.fn;
    return (target: object) => !f.call(target, target);
  }

  make(target: object, _value: unknown): unknown {
    return this.fn.call(target, target);
  }
}

/** Mirrors: ActiveSupport::Callbacks::CallTemplate::InstanceExec2 */
export class InstanceExec2 implements CallTemplate {
  constructor(readonly fn: (target: object, block: (() => unknown) | null) => unknown) {}

  expand(target: object, value: unknown, block: (() => unknown) | null): unknown[] {
    return [target, this.fn, "instanceExec", target, block];
  }

  makeLambda(): (target: object, value: unknown, block?: (() => unknown) | null) => unknown {
    const f = this.fn;
    // Rails: raise ArgumentError unless block; target.instance_exec(target, block, &@override_block)
    // — the around continuation is the second positional arg, not the chain `value`.
    return (target: object, _value: unknown, block?: (() => unknown) | null) => {
      if (!block) throw new Error("InstanceExec2 callback requires a block");
      return f.call(target, target, block);
    };
  }

  invertedLambda(): (target: object, value: unknown, block?: (() => unknown) | null) => boolean {
    const f = this.fn;
    return (target: object, _value: unknown, block?: (() => unknown) | null) => {
      if (!block) throw new Error("InstanceExec2 callback requires a block");
      return !f.call(target, target, block);
    };
  }

  make(target: object, block: (() => unknown) | null): unknown {
    if (!block) throw new Error("InstanceExec2 callback requires a block");
    return this.fn.call(target, target, block);
  }
}

/** Mirrors: ActiveSupport::Callbacks::CallTemplate::ProcCall */
export class ProcCall implements CallTemplate {
  constructor(readonly fn: (...args: any[]) => unknown) {}

  expand(target: object, value: unknown, block: (() => unknown) | null): unknown[] {
    return [this.fn, block, "call", target, value];
  }

  makeLambda(): (target: object, value: unknown, block?: (() => unknown) | null) => unknown {
    const f = this.fn;
    // Rails: @override_block.call(target, value, &block) — no instance_exec, the
    // proc keeps its own binding; forward target, value and the block.
    return (target: object, value: unknown, block?: (() => unknown) | null) =>
      f(target, value, block);
  }

  invertedLambda(): (target: object, value: unknown, block?: (() => unknown) | null) => boolean {
    const f = this.fn;
    return (target: object, value: unknown, block?: (() => unknown) | null) =>
      !f(target, value, block);
  }

  make(target: object, _value: unknown): unknown {
    return this.fn(target);
  }
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

/** Environment struct threaded through the compiled filter chain. */
export interface FilterEnvironment {
  target: object;
  halted: boolean;
  value: unknown;
}

/** Mirrors: ActiveSupport::Callbacks::Filters::Before */
export class Before {
  readonly userCallback: (target: object, value: unknown) => unknown;
  readonly userConditions: Array<(target: object, value: unknown) => boolean>;
  readonly terminator: ((target: object, fn: () => unknown) => boolean) | false | undefined;
  readonly filter: AnyCallback | string | symbol | CallbackObject;
  readonly name: string;

  constructor(
    userCallback: (target: object, value: unknown) => unknown,
    userConditions: Array<(target: object, value: unknown) => boolean>,
    chainConfig: { terminator?: ((target: object, fn: () => unknown) => boolean) | false },
    filter: AnyCallback | string | symbol | CallbackObject = "",
    name: string = "",
  ) {
    this.userCallback = userCallback;
    this.userConditions = userConditions;
    // Keep the raw terminator so call() can distinguish false / custom / default
    // and thread async correctly (Rails' halted_lambda is synchronous; JS
    // callbacks may return a Promise, so the halt decision may be async).
    this.terminator = chainConfig.terminator;
    this.filter = filter;
    this.name = name;
  }

  /**
   * Mirrors Rails `Filters::Before#call` (callbacks.rb) with async threaded
   * through: the default terminator halts on the abort sentinel (thrown sync or
   * rejected async); a `false` terminator never halts but still awaits an async
   * callback (a sentinel rejection propagates, matching the default-only
   * `catch(:abort)` scope); a custom terminator owns the halt decision and does
   * not support async callbacks. In `strict: "sync"` an async callback throws.
   */
  call(
    env: FilterEnvironment,
    opts?: RunCallbacksOptions,
    chainName = "",
  ): FilterEnvironment | Promise<FilterEnvironment> {
    const { target, value, halted } = env;
    if (halted || !this.userConditions.every((c) => c(target, value))) return env;

    const terminatorFn = this.terminator;
    const resultLambda = () => this.userCallback(target, value);

    if (terminatorFn === false) {
      const r = resultLambda();
      if (!isThenable(r)) return env;
      if (opts?.strict === "sync") {
        swallowRejection(r);
        throw new Error(`Async callback on sync chain "${chainName}" — before returned a Promise`);
      }
      // No catch: with the terminator disabled Rails does not scope
      // `catch(:abort)`, so a sentinel rejection propagates as an error.
      return Promise.resolve(r).then(() => env);
    }

    if (terminatorFn) {
      let cbResult: unknown;
      const halt = terminatorFn(target, () => {
        cbResult = resultLambda();
        return cbResult;
      });
      if (isThenable(cbResult)) {
        swallowRejection(cbResult);
        if (opts?.strict === "sync") {
          throw new Error(
            `Async callback on sync chain "${chainName}" — before returned a Promise`,
          );
        }
        throw new Error(
          `Async before callback on chain "${chainName}" is unsupported with a custom terminator. ` +
            `Custom terminators cannot evaluate Promise-returning callbacks. ` +
            `Use the default terminator (halt via throwAbort()) or make all before callbacks synchronous.`,
        );
      }
      if (halt) this.halt(env);
      return env;
    }

    // Default terminator: Rails wraps the call in `catch(:abort)`.
    let cbResult: unknown;
    try {
      cbResult = resultLambda();
    } catch (e) {
      if (!isAbortSignal(e)) throw e;
      this.halt(env);
      return env;
    }
    if (!isThenable(cbResult)) return env;
    if (opts?.strict === "sync") {
      swallowRejection(cbResult);
      throw new Error(`Async callback on sync chain "${chainName}" — before returned a Promise`);
    }
    return Promise.resolve(cbResult).then(
      () => env,
      (e) => {
        if (!isAbortSignal(e)) throw e;
        this.halt(env);
        return env;
      },
    );
  }

  /**
   * Mark the chain halted and fire Rails' `halted_callback_hook(filter, name)`
   * on the target (a private no-op the including class may override to log or
   * instrument which callback halted). Mirrors `Before#call`'s
   * `target.send :halted_callback_hook, filter, name`.
   */
  private halt(env: FilterEnvironment): void {
    env.halted = true;
    const hook = (env.target as { haltedCallbackHook?: (filter: unknown, name: string) => void })
      .haltedCallbackHook;
    if (typeof hook === "function") hook.call(env.target, this.filter, this.name);
  }

  apply(seq: CallbackSequence): CallbackSequence {
    return seq.before(this);
  }

  static build(callback: Callback, options: DefineCallbacksOptions): (target: object) => boolean {
    const terminatorFn = options.terminator;
    return (target: object) => {
      if (!Value.check(callback.options, target)) return true;
      const cb = callback.filter as BeforeCallback;
      if (terminatorFn === false) {
        cb.call(target, target);
        return true;
      } // run but never halt
      if (terminatorFn) return !terminatorFn(target, () => cb.call(target, target));
      // Default terminator: halt only on the abort sentinel (Rails 5+).
      try {
        cb.call(target, target);
        return true;
      } catch (e) {
        if (isAbortSignal(e)) return false;
        throw e;
      }
    };
  }
}

/** Mirrors: ActiveSupport::Callbacks::Filters::After */
export class After {
  readonly userCallback: (target: object, value: unknown) => unknown;
  readonly userConditions: Array<(target: object, value: unknown) => boolean>;
  readonly halting: boolean;

  constructor(
    userCallback: (target: object, value: unknown) => unknown,
    userConditions: Array<(target: object, value: unknown) => boolean>,
    chainConfig: { skipAfterCallbacksIfTerminated?: boolean },
  ) {
    this.userCallback = userCallback;
    this.userConditions = userConditions;
    this.halting = chainConfig.skipAfterCallbacksIfTerminated ?? false;
  }

  call(
    env: FilterEnvironment,
    opts?: RunCallbacksOptions,
    chainName = "",
  ): FilterEnvironment | Promise<FilterEnvironment> {
    const { target, value, halted } = env;
    if ((!halted || !this.halting) && this.userConditions.every((c) => c(target, value))) {
      const r = this.userCallback(target, value);
      if (isThenable(r)) {
        if (opts?.strict === "sync") {
          swallowRejection(r);
          throw new Error(`Async callback on sync chain "${chainName}" — after returned a Promise`);
        }
        return Promise.resolve(r).then(() => env);
      }
    }
    return env;
  }

  apply(seq: CallbackSequence): CallbackSequence {
    return seq.after(this);
  }

  static build(callback: Callback): (target: object) => void {
    return (target: object) => {
      if (!Value.check(callback.options, target)) return;
      (callback.filter as AfterCallback).call(target, target);
    };
  }
}

/** Mirrors: ActiveSupport::Callbacks::Filters::Around */
export class Around {
  private readonly userCallback: CallTemplate;
  private readonly userConditions: Array<(target: object, value: unknown) => boolean>;

  constructor(
    userCallback: CallTemplate,
    userConditions: Array<(target: object, value: unknown) => boolean>,
  ) {
    this.userCallback = userCallback;
    this.userConditions = userConditions;
  }

  apply(seq: CallbackSequence): CallbackSequence {
    return seq.around(this.userCallback, this.userConditions);
  }

  static build(callback: Callback): (target: object, block: () => void) => void {
    return (target: object, block: () => void) => {
      if (!Value.check(callback.options, target)) {
        block();
        return;
      }
      (callback.filter as AroundCallback).call(target, target, block);
    };
  }
}

// ---------------------------------------------------------------------------
// Callback
// ---------------------------------------------------------------------------

/** Mirrors: ActiveSupport::Callbacks::Callback */
export class Callback {
  kind: CallbackKind;
  name: string;
  readonly filter: AnyCallback | string | symbol | CallbackObject;
  readonly options: CallbackOptions;
  readonly chainConfig: DefineCallbacksOptions;
  /** Preserved when registered via a CallbackObject so skipCallback can match by original reference. */
  readonly originalObject?: CallbackObject;

  private _compiled: Before | After | Around | undefined;

  constructor(
    name: string,
    filter: AnyCallback | string | symbol | CallbackObject,
    kind: CallbackKind,
    options: CallbackOptions = {},
    chainConfig: DefineCallbacksOptions = {},
    originalObject?: CallbackObject,
  ) {
    this.name = name;
    this.filter = filter;
    this.kind = kind;
    this.options = options;
    this.chainConfig = chainConfig;
    this.originalObject = originalObject;
    // Rails' Callback#initialize eagerly builds `compiled` (callbacks.rb), so a
    // String filter raises ArgumentError at set_callback time, not lazily on the
    // first run_callbacks. Match that eager timing.
    void this.compiled;
  }

  matches(kind: CallbackKind, filter?: AnyCallback | string | symbol | CallbackObject): boolean {
    if (this.kind !== kind) return false;
    if (filter === undefined) return true;
    if (typeof filter === "object" && filter !== null) return this.originalObject === filter;
    return this.filter === filter;
  }

  mergeConditionalOptions(
    chain: { name: string; config: DefineCallbacksOptions },
    ifOption: CallbackCondition[],
    unlessOption: CallbackCondition[],
  ): Callback {
    const existingIf = Array.isArray(this.options.if)
      ? this.options.if
      : this.options.if
        ? [this.options.if]
        : [];
    const existingUnless = Array.isArray(this.options.unless)
      ? this.options.unless
      : this.options.unless
        ? [this.options.unless]
        : [];
    return new Callback(
      chain.name,
      this.filter,
      this.kind,
      {
        if: [...existingIf, ...unlessOption],
        unless: [...existingUnless, ...ifOption],
      },
      chain.config,
      this.originalObject,
    );
  }

  isDuplicates(other: Callback): boolean {
    if (typeof this.filter === "string") {
      return this.kind === other.kind && this.filter === other.filter;
    }
    return false;
  }

  get compiled(): Before | After | Around {
    if (this._compiled) return this._compiled;

    const userConditions: Array<(target: object, value: unknown) => boolean> = [];
    const ifConds = Array.isArray(this.options.if)
      ? this.options.if
      : this.options.if
        ? [this.options.if]
        : [];
    const unlessConds = Array.isArray(this.options.unless)
      ? this.options.unless
      : this.options.unless
        ? [this.options.unless]
        : [];
    // Forward `value` (env.value — the run_callbacks block's return) to each
    // condition. ActiveModel's after-model-callback guard (`value != false`)
    // reads it to skip after callbacks when the block returned false or the
    // chain halted. Mirrors Rails conditions_lambdas + Conditionals::Value.
    for (const c of ifConds) userConditions.push((t, v) => c(t, v));
    for (const c of unlessConds) userConditions.push((t, v) => !c(t, v));

    // Mirrors ActiveSupport::Callbacks::CallTemplate.build: a Proc/block filter
    // compiles to InstanceExec{0,1,2} (run via instance_exec, so `self` is the
    // record) selected by arity; a method-name filter compiles to MethodCall.
    let callTemplate: CallTemplate;
    if (typeof this.filter === "function") {
      const arity = this.filter.length;
      callTemplate =
        arity > 1
          ? new InstanceExec2(
              this.filter as (target: object, block: (() => unknown) | null) => unknown,
            )
          : arity > 0
            ? new InstanceExec1(this.filter as (target: object) => unknown)
            : new InstanceExec0(this.filter as () => unknown);
    } else if (typeof this.filter === "string") {
      // Rails Callback.build raises ArgumentError for a String filter; only a
      // Symbol (method name) or a proc/block is permitted.
      throw new Error(
        `Passing string to define a callback is not supported: ${String(this.filter)}`,
      );
    } else if (typeof this.filter === "object" && this.filter !== null) {
      // Rails CallTemplate.build: an object filter compiles to
      // ObjectCall.new(filter, current_scopes.join("_").to_sym) — the dispatched
      // method is the callback's scope-join, so the default `[:kind]` scope calls
      // `around`/`before`/`after` and `scope: [:kind, :name]` calls `aroundSave`.
      callTemplate = new ObjectCall(this.filter, this.objectCallMethodName());
    } else {
      callTemplate = new MethodCall(this.filter as PropertyKey);
    }

    if (this.kind === "before") {
      this._compiled = new Before(
        callTemplate.makeLambda(),
        userConditions,
        this.chainConfig,
        this.filter,
        this.name,
      );
    } else if (this.kind === "after") {
      this._compiled = new After(callTemplate.makeLambda(), userConditions, {
        skipAfterCallbacksIfTerminated: this.chainConfig.skipAfterCallbacksIfTerminated,
      });
    } else {
      this._compiled = new Around(callTemplate, userConditions);
    }
    return this._compiled;
  }

  currentScopes(): string[] {
    const scope = this.chainConfig.scope ?? ["kind"];
    return scope.map((s) =>
      s === "kind" ? String(this.kind) : String((this as Record<string, unknown>)[s]),
    );
  }

  /**
   * The object-callback method name — Rails' `current_scopes.join("_").to_sym`,
   * camelCased for TS. Default scope `[:kind]` → `around`/`before`/`after`;
   * `scope: [:kind, :name]` → `aroundSave`/`beforeSave`.
   */
  private objectCallMethodName(): string {
    const [head, ...rest] = this.currentScopes();
    return head + rest.map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join("");
  }
}

// ---------------------------------------------------------------------------
// CallbackSequence
// ---------------------------------------------------------------------------

/**
 * Compiled, linked-list callback sequence.
 * Mirrors: ActiveSupport::Callbacks::CallbackSequence
 */
export class CallbackSequence {
  readonly nested: CallbackSequence | null;
  private readonly callTemplate: CallTemplate | null;
  private readonly userConditions: Array<(target: object, value: unknown) => boolean> | null;
  private beforeList: Before[] | null = null;
  private afterList: After[] | null = null;

  constructor(
    nested: CallbackSequence | null = null,
    callTemplate: CallTemplate | null = null,
    userConditions: Array<(target: object, value: unknown) => boolean> | null = null,
  ) {
    this.nested = nested;
    this.callTemplate = callTemplate;
    this.userConditions = userConditions;
  }

  before(b: Before): this {
    (this.beforeList ??= []).unshift(b);
    return this;
  }

  after(a: After): this {
    (this.afterList ??= []).push(a);
    return this;
  }

  around(
    callTemplate: CallTemplate,
    userConditions: Array<(target: object, value: unknown) => boolean>,
  ): CallbackSequence {
    const sequence = new CallbackSequence(this, callTemplate, userConditions);
    sequence._callbackChain = this._callbackChain;
    return sequence;
  }

  isSkip(env: FilterEnvironment): boolean {
    if (env.halted) return true;
    if (!this.userConditions) return false;
    return !this.userConditions.every((c) => c(env.target, env.value));
  }

  isFinal(): boolean {
    return !this.callTemplate;
  }

  expandCallTemplate(env: FilterEnvironment, block: (() => unknown) | null): unknown[] {
    return this.callTemplate!.expand(env.target, env.value, block);
  }

  /**
   * Dispatch this (non-final) sequence's around callback with `next` as its block
   * continuation. Mirrors Rails' `target, block, method, *arguments =
   * current.expand_call_template(env, invoke_sequence)` followed by
   * `target.send(method, *arguments, &block)` — the CallTemplate's `expand`
   * chooses the shape, and each of Ruby's `instance_exec` / `Proc#call` /
   * `send`-with-block forms maps onto the JS call below.
   */
  invokeAround(env: FilterEnvironment, next: () => unknown): unknown {
    const expanded = this.expandCallTemplate(env, next);
    const method = expanded[2];
    if (method === "instanceExec") {
      // [target, fn, "instanceExec", ...arguments] — instance_exec(*arguments, &fn):
      // run fn with `this` bound to target and the arguments (incl. continuation).
      const fn = expanded[1] as (...args: unknown[]) => unknown;
      return fn.apply(expanded[0], expanded.slice(3));
    }
    if (method === "call") {
      // [fn, block, "call", target, value] — fn.call(target, value, &block):
      // the proc keeps its own binding; forward args then the continuation.
      const fn = expanded[0] as (...args: unknown[]) => unknown;
      return fn(...expanded.slice(3), expanded[1]);
    }
    // [receiver, block, methodName, ...arguments] — receiver.send(methodName,
    // *arguments, &block): the method receives the continuation as its last arg.
    const receiver = expanded[0] as Record<PropertyKey, (...args: unknown[]) => unknown>;
    return receiver[method as PropertyKey](...expanded.slice(3), expanded[1]);
  }

  invokeBefore(
    env: FilterEnvironment,
    opts?: RunCallbacksOptions,
    chainName = "",
  ): void | Promise<void> {
    return this._runFilters(this.beforeList, 0, env, opts, chainName);
  }

  invokeAfter(
    env: FilterEnvironment,
    opts?: RunCallbacksOptions,
    chainName = "",
  ): void | Promise<void> {
    return this._runFilters(this.afterList, 0, env, opts, chainName);
  }

  /** Run before/after filters in order, awaiting any that return a Promise. */
  private _runFilters(
    list: Array<Before | After> | null,
    start: number,
    env: FilterEnvironment,
    opts: RunCallbacksOptions | undefined,
    chainName: string,
  ): void | Promise<void> {
    if (!list) return;
    for (let i = start; i < list.length; i++) {
      const r = list[i].call(env, opts, chainName);
      if (isThenable(r)) {
        return Promise.resolve(r).then(() => this._runFilters(list, i + 1, env, opts, chainName));
      }
    }
  }

  invoke(
    target: object,
    block: (() => unknown) | undefined,
    opts: RunCallbacksOptions & { strict: "sync" },
  ): boolean;
  invoke(
    target: object,
    block?: () => unknown,
    opts?: RunCallbacksOptions,
  ): boolean | Promise<boolean>;
  invoke(
    target: object,
    block?: () => unknown,
    opts?: RunCallbacksOptions,
  ): boolean | Promise<boolean> {
    const chainName = this._callbackChain?.name ?? "";
    const env: FilterEnvironment = { target, halted: false, value: undefined };

    // Common case (Rails run_callbacks' `if next_sequence.final?` branch):
    // invoke_before → env.value = !halted && (!block || yield) → invoke_after.
    if (this.isFinal()) {
      const beforeDone = this.invokeBefore(env, opts, chainName);
      if (isThenable(beforeDone)) {
        return Promise.resolve(beforeDone).then(() =>
          this._finishFinal(env, block, opts, chainName),
        );
      }
      return this._finishFinal(env, block, opts, chainName);
    }

    // Around case: the port of Rails run_callbacks' `invoke_sequence` Proc.
    return this._invokeAround(env, block, opts, chainName);
  }

  /**
   * Port of Rails run_callbacks' `invoke_sequence` Proc (callbacks.rb): walk the
   * nested sequences, running each `invoke_before`, dispatching around callbacks
   * with the continuation as their block (`expand_call_template` + `send`), and
   * running each `invoke_after` as the recursion unwinds. Async is threaded with
   * the same fire-and-forget / awaited-rescue semantics the retired
   * `_runAroundAndAfter` provided. Returns whether the final block executed
   * without the chain halting.
   */
  private _invokeAround(
    env: FilterEnvironment,
    block: (() => unknown) | undefined,
    opts: RunCallbacksOptions | undefined,
    chainName: string,
  ): boolean | Promise<boolean> {
    let reachedFinal = false;

    // Final sequence: env.value = !halted && (!block || yield); then invoke_after.
    const runFinal = (current: CallbackSequence): void | Promise<void> => {
      if (env.halted) {
        env.value = false;
        return current.invokeAfter(env, opts, chainName);
      }
      const y = block ? block() : true;
      if (isThenable(y)) {
        if (opts?.strict === "sync") {
          swallowRejection(y);
          throw new Error(`Async callback on sync chain "${chainName}" — block returned a Promise`);
        }
        return Promise.resolve(y).then((v) => {
          env.value = v;
          reachedFinal = true;
          return current.invokeAfter(env, opts, chainName);
        });
      }
      env.value = y;
      reachedFinal = true;
      return current.invokeAfter(env, opts, chainName);
    };

    const runSeq = (current: CallbackSequence): void | Promise<void> => {
      const beforeDone = current.invokeBefore(env, opts, chainName);
      if (isThenable(beforeDone)) {
        return Promise.resolve(beforeDone).then(() => afterBefore(current));
      }
      return afterBefore(current);
    };

    const afterBefore = (current: CallbackSequence): void | Promise<void> => {
      if (current.isFinal()) return runFinal(current);
      // A skipped around (condition failed or chain halted) is not invoked; recurse
      // straight into the nested sequence, then run its own invoke_after as Rails
      // does via the deferred `skipped` stack (LIFO == recursion unwinding).
      if (current.isSkip(env)) {
        const inner = runSeq(current.nested!);
        if (isThenable(inner)) {
          return Promise.resolve(inner).then(() => current.invokeAfter(env, opts, chainName));
        }
        return current.invokeAfter(env, opts, chainName);
      }
      return runAround(current);
    };

    const runAround = (current: CallbackSequence): void | Promise<void> => {
      let pendingProceed: Promise<void> | undefined;
      let proceedObserved = false;
      const next = (): unknown => {
        const r = runSeq(current.nested!);
        // Rails' invoke_sequence Proc breaks with `env.value`, so `yield` (next())
        // returns the event value — the block's return. Surface it here so an
        // around can do `const v = next()` / `await next()` (callbacks.rb#128,136).
        if (!isThenable(r)) return env.value;
        pendingProceed = Promise.resolve(r);
        // Return a thenable wrapper so we can detect whether the around actually
        // awaited/chained on next() (real observation) versus firing it and
        // forgetting. `await` and `.then(_, r)` both wire an onRejected; bare
        // `next();`, `.then(onFulfilled)`, and `.finally()` do not. It resolves to
        // env.value so an awaited next() yields the block result.
        const observed = pendingProceed.then(() => env.value);
        observed.catch(() => {}); // guard the derived promise; real path is pendingProceed
        return {
          then(onFulfilled?: any, onRejected?: any) {
            if (typeof onRejected === "function") {
              proceedObserved = true;
              return observed.then(onFulfilled, onRejected);
            }
            const p = observed.then(onFulfilled);
            p.catch(() => {});
            return p;
          },
          catch(onRejected?: any) {
            if (typeof onRejected === "function") {
              proceedObserved = true;
              return observed.catch(onRejected);
            }
            const p = observed.catch(onRejected);
            p.catch(() => {});
            return p;
          },
          finally(onFinally?: any) {
            const p = observed.finally(onFinally);
            p.catch(() => {});
            return p;
          },
        } as unknown as Promise<void>;
      };

      const afterAround = (): void | Promise<void> => current.invokeAfter(env, opts, chainName);

      let cbResult: void | Promise<void>;
      try {
        cbResult = current.invokeAround(env, next) as void | Promise<void>;
      } catch (err) {
        if (pendingProceed) {
          return (async () => {
            await pendingProceed.catch(() => {});
            throw err;
          })();
        }
        throw err;
      }
      if (isThenable(cbResult) || pendingProceed) {
        if (opts?.strict === "sync") {
          swallowRejection(cbResult);
          swallowRejection(pendingProceed);
          throw new Error(
            `Async callback on sync chain "${chainName}" — around callback or block returned a Promise`,
          );
        }
        return (async () => {
          try {
            await cbResult;
          } catch (err) {
            if (pendingProceed) await pendingProceed.catch(() => {});
            throw err;
          }
          if (pendingProceed) {
            // Swallow only when the around actually observed next() (awaited or
            // chained a rejection handler); fire-and-forget arounds couldn't have
            // rescued, so propagate the inner rejection.
            if (proceedObserved) await pendingProceed.catch(() => {});
            else await pendingProceed;
          }
          return afterAround();
        })();
      }
      return afterAround();
    };

    const result = runSeq(this);
    if (isThenable(result)) return Promise.resolve(result).then(() => reachedFinal);
    return reachedFinal;
  }

  private _finishFinal(
    env: FilterEnvironment,
    block: (() => unknown) | undefined,
    opts: RunCallbacksOptions | undefined,
    chainName: string,
  ): boolean | Promise<boolean> {
    // Rails: env.value = !env.halted && (!block_given? || yield)
    if (env.halted) {
      env.value = false;
      const afterDone = this.invokeAfter(env, opts, chainName);
      if (isThenable(afterDone)) return Promise.resolve(afterDone).then(() => false);
      return false;
    }
    const y = block ? block() : true;
    if (isThenable(y)) {
      if (opts?.strict === "sync") {
        swallowRejection(y);
        throw new Error(`Async callback on sync chain "${chainName}" — block returned a Promise`);
      }
      return Promise.resolve(y).then((v) => {
        env.value = v;
        const afterDone = this.invokeAfter(env, opts, chainName);
        if (isThenable(afterDone)) return Promise.resolve(afterDone).then(() => true);
        return true;
      });
    }
    env.value = y;
    const afterDone = this.invokeAfter(env, opts, chainName);
    if (isThenable(afterDone)) return Promise.resolve(afterDone).then(() => true);
    return true;
  }

  // Back-reference set by CallbackChain.compile() for invoke() convenience
  _callbackChain: CallbackChain | null = null;
}

// ---------------------------------------------------------------------------
// CallbackChain
// ---------------------------------------------------------------------------

export class CallbackChain {
  readonly name: string;
  readonly config: DefineCallbacksOptions;
  private chain: Callback[];
  // Memoized compiled sequence (Rails' @all_callbacks). Reset to undefined on
  // every chain mutation (append/prepend/insert/delete/remove/clear), matching
  // Rails' @all_callbacks = nil reset points. No mutex: Rails guards the rebuild
  // with @mutex.synchronize for thread safety, but JS is single-threaded so
  // runCallbacks never re-enters compile() concurrently — the lock is moot.
  private _allCallbacks: CallbackSequence | undefined;

  constructor(name: string, config: DefineCallbacksOptions = {}) {
    this.name = name;
    // Do NOT inject a default terminator into config — undefined means "use default"
    // and is what gets passed when cloning chains. Injecting a function would make
    // cloned chains think they have a custom terminator.
    this.config = { ...config };
    this.chain = [];
  }

  get entries(): Callback[] {
    return this.chain;
  }

  each(fn: (cb: Callback) => void): void {
    this.chain.forEach(fn);
  }

  index(cb: Callback): number {
    return this.chain.indexOf(cb);
  }

  insert(idx: number, cb: Callback): void {
    this._allCallbacks = undefined;
    this.chain.splice(idx, 0, cb);
  }

  delete(cb: Callback): void {
    this._allCallbacks = undefined;
    const i = this.chain.indexOf(cb);
    if (i !== -1) this.chain.splice(i, 1);
  }

  append(callback: Callback): void {
    this._allCallbacks = undefined;
    this.chain.push(callback);
  }

  prepend(callback: Callback): void {
    this._allCallbacks = undefined;
    this.chain.unshift(callback);
  }

  remove(kind: CallbackKind, filter?: AnyCallback | string | symbol | CallbackObject): void {
    this._allCallbacks = undefined;
    this.chain = this.chain.filter((cb) => !cb.matches(kind, filter));
  }

  clear(): void {
    this._allCallbacks = undefined;
    this.chain = [];
  }

  compile(): CallbackSequence {
    if (this._allCallbacks) return this._allCallbacks;
    // Mirrors Rails CallbackChain#compile: fold the chain in reverse, applying
    // each callback's compiled filter onto the sequence. before/after mutate the
    // (single) final sequence's lists; around wraps it in a new nested sequence.
    let seq = new CallbackSequence();
    for (let i = this.chain.length - 1; i >= 0; i--) {
      seq = this.chain[i].compiled.apply(seq);
    }
    seq._callbackChain = this;
    this._allCallbacks = seq;
    return seq;
  }

  get isEmpty(): boolean {
    return this.chain.length === 0;
  }
}

// ---------------------------------------------------------------------------
// ClassMethods
// ---------------------------------------------------------------------------

const CALLBACK_FILTER_TYPES: CallbackKind[] = ["before", "after", "around"];

/**
 * Mirrors: ActiveSupport::Callbacks::ClassMethods#normalize_callback_params
 */
export function normalizeCallbackParams(
  filters: Array<CallbackKind | AnyCallback | string | symbol | Record<string, unknown>>,
  block: AnyCallback | null,
): [CallbackKind, Array<AnyCallback | string | symbol>, Record<string, unknown>] {
  const rest = [...filters];
  let type: CallbackKind = "before";
  if (rest.length > 0 && CALLBACK_FILTER_TYPES.includes(rest[0] as CallbackKind)) {
    type = rest.shift() as CallbackKind;
  }
  let options: Record<string, unknown> = {};
  if (
    rest.length > 0 &&
    typeof rest[rest.length - 1] === "object" &&
    rest[rest.length - 1] !== null &&
    !("call" in (rest[rest.length - 1] as object))
  ) {
    options = rest.pop() as unknown as Record<string, unknown>;
  }
  if (block) rest.unshift(block);
  return [type, rest as Array<AnyCallback | string | symbol>, options];
}

/**
 * Mirrors: ActiveSupport::Callbacks::ClassMethods#__update_callbacks
 */
export function __updateCallbacks(
  name: string,
  targets: Array<{
    getCallbacks(name: string): CallbackChain;
    setCallbacks(name: string, chain: CallbackChain): void;
  }>,
  fn: (target: object, chain: CallbackChain) => void,
): void {
  [...targets].reverse().forEach((target) => {
    const chain = target.getCallbacks(name);
    const dup = new CallbackChain(chain.name, chain.config);
    chain.entries.forEach((e) =>
      dup.append(
        new Callback(e.name, e.filter, e.kind, { ...e.options }, dup.config, e.originalObject),
      ),
    );
    fn(target, dup);
    target.setCallbacks(name, dup);
  });
}

// ---------------------------------------------------------------------------
// Namespaces (mirrors Rails module nesting)
// ---------------------------------------------------------------------------

const _ct = { MethodCall, ObjectCall, InstanceExec0, InstanceExec1, InstanceExec2, ProcCall };
export namespace CallTemplate {
  export const MethodCall = _ct.MethodCall;
  export const ObjectCall = _ct.ObjectCall;
  export const InstanceExec0 = _ct.InstanceExec0;
  export const InstanceExec1 = _ct.InstanceExec1;
  export const InstanceExec2 = _ct.InstanceExec2;
  export const ProcCall = _ct.ProcCall;
}

const _cond = { Value };
export namespace Conditionals {
  export const Value = _cond.Value;
}

const _filt = { Before, After, Around };
export namespace Filters {
  export const Before = _filt.Before;
  export const After = _filt.After;
  export const Around = _filt.Around;
}

// ---------------------------------------------------------------------------
// Runtime API (unchanged from original)
// ---------------------------------------------------------------------------

export interface ClassMethods<T extends object = object> {
  defineCallbacks(name: string, options?: DefineCallbacksOptions<T>): void;
  beforeCallback(
    name: string,
    callback: BeforeCallback<T> | CallbackObject,
    options?: CallbackOptions<T>,
  ): void;
  afterCallback(
    name: string,
    callback: AfterCallback<T> | CallbackObject,
    options?: CallbackOptions<T>,
  ): void;
  aroundCallback(
    name: string,
    callback: AroundCallback<T> | CallbackObject,
    options?: CallbackOptions<T>,
  ): void;
  skipCallback(name: string, kind: CallbackKind, callback?: AnyCallback<T> | CallbackObject): void;
  resetCallbacks(name: string): void;
}

const CALLBACKS = Symbol("callbacks");

/**
 * Read-only lookup of a single CallbackChain for `name`. Walks the prototype
 * chain of `target` looking for the **first** object that owns a CALLBACKS
 * map, then returns `map.get(name)` — which may be `undefined` if that map
 * does not contain `name`. The walk stops at the first own CALLBACKS map; it
 * does not continue up to find `name` in a higher ancestor. This is
 * intentional COW semantics: once a class owns its CALLBACKS map (because it
 * registered at least one callback), all chains it knows about are inside that
 * map. Does NOT trigger copy-on-write.
 *
 * @internal
 */
export function peekCallbackChain(target: object, name: string): CallbackChain | undefined {
  let t: object | null = target;
  while (t !== null) {
    if (Object.prototype.hasOwnProperty.call(t, CALLBACKS)) {
      return (t as Record<symbol, Map<string, CallbackChain>>)[CALLBACKS].get(name);
    }
    t = Object.getPrototypeOf(t);
  }
  return undefined;
}

/** @internal */
export function getCallbackChains(target: object): Map<string, CallbackChain> {
  const t = target as Record<symbol, unknown>;
  if (!Object.prototype.hasOwnProperty.call(target, CALLBACKS)) {
    const parent = t[CALLBACKS] as Map<string, CallbackChain> | undefined;
    const own = new Map<string, CallbackChain>();
    if (parent) {
      for (const [name, chain] of parent) {
        const newChain = new CallbackChain(chain.name, chain.config);
        for (const entry of chain.entries) {
          newChain.append(
            new Callback(
              entry.name,
              entry.filter,
              entry.kind,
              entry.options,
              newChain.config,
              entry.originalObject,
            ),
          );
        }
        own.set(name, newChain);
      }
    }
    t[CALLBACKS] = own;
  }
  return t[CALLBACKS] as Map<string, CallbackChain>;
}

export namespace Callbacks {
  export function defineCallbacks<T extends object>(
    target: T,
    name: string,
    options: DefineCallbacksOptions<T> = {},
  ): void {
    const chains = getCallbackChains(target);
    if (!chains.has(name)) {
      chains.set(name, new CallbackChain(name, options as DefineCallbacksOptions));
    }
  }

  export function setCallback<T extends object>(
    target: T,
    name: string,
    kind: CallbackKind,
    callback: AnyCallback<T> | CallbackObject,
    options: CallbackOptions<T> = {},
  ): void {
    const chains = getCallbackChains(target);
    const chain = chains.get(name);
    if (!chain) {
      throw new Error(`No callback chain "${name}" defined. Call defineCallbacks first.`);
    }
    // Rails hands the callback object straight to Callback.build, which compiles
    // it to an ObjectCall honouring the chain scope — no function-wrapping.
    const isObj = typeof callback === "object" && callback !== null;
    const entry = new Callback(
      name,
      callback as AnyCallback | CallbackObject,
      kind,
      options as CallbackOptions,
      chain.config,
      isObj ? callback : undefined,
    );
    if (options.prepend) {
      chain.prepend(entry);
    } else {
      chain.append(entry);
    }
  }

  export function skipCallback<T extends object>(
    target: T,
    name: string,
    kind: CallbackKind,
    callback?: AnyCallback<T> | CallbackObject,
  ): void {
    const chains = getCallbackChains(target);
    const chain = chains.get(name);
    if (!chain) return;
    chain.remove(kind, callback as AnyCallback | CallbackObject | undefined);
  }

  export function resetCallbacks(target: object, name: string): void {
    const chains = getCallbackChains(target);
    const chain = chains.get(name);
    if (chain) chain.clear();
  }

  export function runCallbacks(
    target: object,
    name: string,
    block: (() => unknown) | undefined,
    opts: RunCallbacksOptions & { strict: "sync" },
  ): boolean;
  export function runCallbacks(
    target: object,
    name: string,
    block?: () => unknown,
    opts?: RunCallbacksOptions,
  ): boolean | Promise<boolean>;
  export function runCallbacks(
    target: object,
    name: string,
    block?: () => unknown,
    opts?: RunCallbacksOptions,
  ): boolean | Promise<boolean> {
    const chains = getCallbackChains(target);
    const chain = chains.get(name);
    if (!chain) {
      const r = block?.();
      if (!isThenable(r)) return true;
      if (opts?.strict === "sync") {
        swallowRejection(r);
        throw new Error("Async block on chain with no callbacks");
      }
      return Promise.resolve(r).then(() => true);
    }
    const sequence = chain.compile();
    return sequence.invoke(target, block, opts);
  }
}

export function defineCallbacks<T extends object>(
  target: T,
  name: string,
  options: DefineCallbacksOptions<T> = {},
): void {
  Callbacks.defineCallbacks(target, name, options);
}

export function setCallback<T extends object>(
  target: T,
  name: string,
  kind: CallbackKind,
  callback: AnyCallback<T> | CallbackObject,
  options: CallbackOptions<T> = {},
): void {
  Callbacks.setCallback(target, name, kind, callback, options);
}

export function skipCallback<T extends object>(
  target: T,
  name: string,
  kind: CallbackKind,
  callback?: AnyCallback<T> | CallbackObject,
): void {
  Callbacks.skipCallback(target, name, kind, callback);
}

export function resetCallbacks(target: object, name: string): void {
  Callbacks.resetCallbacks(target, name);
}

export function runCallbacks(
  target: object,
  name: string,
  block: (() => unknown) | undefined,
  opts: RunCallbacksOptions & { strict: "sync" },
): boolean;
export function runCallbacks(
  target: object,
  name: string,
  block?: () => unknown,
  opts?: RunCallbacksOptions,
): boolean | Promise<boolean>;
export function runCallbacks(
  target: object,
  name: string,
  block?: () => unknown,
  opts?: RunCallbacksOptions,
): boolean | Promise<boolean> {
  return Callbacks.runCallbacks(target, name, block, opts);
}

export function CallbacksMixin<TBase extends new (...args: any[]) => object>(Base?: TBase) {
  const ActualBase = (Base ?? class {}) as TBase;

  class WithCallbacks extends ActualBase {
    static defineCallbacks<T extends object>(
      this: { prototype: T },
      name: string,
      options: DefineCallbacksOptions<T> = {},
    ): void {
      defineCallbacks(this.prototype, name, options);
    }

    static beforeCallback<T extends object>(
      this: { prototype: T },
      name: string,
      callback: BeforeCallback<T> | CallbackObject,
      options: CallbackOptions<T> = {},
    ): void {
      setCallback(this.prototype, name, "before", callback, options);
    }

    static afterCallback<T extends object>(
      this: { prototype: T },
      name: string,
      callback: AfterCallback<T> | CallbackObject,
      options: CallbackOptions<T> = {},
    ): void {
      setCallback(this.prototype, name, "after", callback, options);
    }

    static aroundCallback<T extends object>(
      this: { prototype: T },
      name: string,
      callback: AroundCallback<T> | CallbackObject,
      options: CallbackOptions<T> = {},
    ): void {
      setCallback(this.prototype, name, "around", callback, options);
    }

    static skipCallback<T extends object>(
      this: { prototype: T },
      name: string,
      kind: CallbackKind,
      callback?: AnyCallback<T> | CallbackObject,
    ): void {
      skipCallback(this.prototype, name, kind, callback);
    }

    static resetCallbacks(name: string): void {
      resetCallbacks(this.prototype, name);
    }

    runCallbacks(
      name: string,
      block: (() => unknown) | undefined,
      opts: RunCallbacksOptions & { strict: "sync" },
    ): boolean;
    runCallbacks(
      name: string,
      block?: () => unknown,
      opts?: RunCallbacksOptions,
    ): boolean | Promise<boolean>;
    runCallbacks(
      name: string,
      block?: () => unknown,
      opts?: RunCallbacksOptions,
    ): boolean | Promise<boolean> {
      return runCallbacks(this, name, block, opts);
    }

    // A hook invoked every time a before callback is halted. Overridable in
    // implementors (Rails: ActiveSupport::Callbacks#halted_callback_hook) to
    // provide better debugging/logging. Default is a no-op.
    haltedCallbackHook(_filter: unknown, _name: string): void {}
  }

  return WithCallbacks;
}
