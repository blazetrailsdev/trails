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
 * Object form for callbacks. Mirrors activemodel's object-callback dispatch.
 * The object must implement a method named after the kind and event:
 * `beforeSave`, `afterSave`, or `aroundSave` for an event named `"save"`.
 *
 * @example
 * ```ts
 * const logger = {
 *   beforeSave(record: MyModel) { console.log("saving", record); },
 *   afterSave(record: MyModel)  { console.log("saved",  record); },
 * };
 * setCallback(target, "save", "before", logger);
 * setCallback(target, "save", "after",  logger);
 * ```
 */
export type CallbackObject = { [key: string]: unknown };

/**
 * Resolves an object-form callback to a plain function, matching the Rails
 * activemodel `resolveCallback` dispatch. Throws if the required method
 * (e.g. `beforeSave` for kind=before, name=save) is absent.
 * @internal
 */
function resolveCallbackObject<T extends object>(
  obj: CallbackObject,
  kind: CallbackKind,
  name: string,
): AnyCallback<T> {
  const camelName = name.charAt(0).toUpperCase() + name.slice(1);
  const methodName = `${kind}${camelName}`;
  const method = obj[methodName] as ((...args: any[]) => unknown) | undefined;
  if (typeof method !== "function") {
    throw new Error(
      `Callback object must implement ${methodName} (for kind="${kind}", name="${name}")`,
    );
  }
  if (kind === "around") {
    return ((target: T, proceed: () => void | Promise<void>) =>
      method.call(obj, target, proceed)) as AroundCallback<T>;
  }
  return ((target: T) => method.call(obj, target)) as BeforeCallback<T> | AfterCallback<T>;
}

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
// Callback
// ---------------------------------------------------------------------------

/** Mirrors: ActiveSupport::Callbacks::Callback */
export class Callback {
  kind: CallbackKind;
  name: string;
  readonly filter: AnyCallback | string | symbol;
  readonly options: CallbackOptions;
  readonly chainConfig: DefineCallbacksOptions;
  /** Preserved when registered via a CallbackObject so skipCallback can match by original reference. */
  readonly originalObject?: CallbackObject;

  constructor(
    name: string,
    filter: AnyCallback | string | symbol,
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

  currentScopes(): string[] {
    const scope = this.chainConfig.scope ?? ["kind"];
    return scope.map((s) =>
      s === "kind" ? String(this.kind) : String((this as Record<string, unknown>)[s]),
    );
  }
}

// ---------------------------------------------------------------------------
// CallbackSequence
// ---------------------------------------------------------------------------

/**
 * Thin sequence produced by {@link CallbackChain.compile}; `invoke` runs the
 * chain via {@link CallbackChain._invoke}, the single before/around/after engine.
 * Mirrors: ActiveSupport::Callbacks::CallbackSequence (compile → invoke).
 */
export class CallbackSequence {
  constructor(private readonly callbackChain: CallbackChain) {}

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
    return this.callbackChain._invoke(target, block, opts);
  }
}

// ---------------------------------------------------------------------------
// CallbackChain
// ---------------------------------------------------------------------------

export class CallbackChain {
  readonly name: string;
  readonly config: DefineCallbacksOptions;
  /** True when a custom (non-default) terminator was supplied at define time. */
  private readonly _hasCustomTerminator: boolean;
  private chain: Callback[];

  constructor(name: string, config: DefineCallbacksOptions = {}) {
    this._hasCustomTerminator = typeof config.terminator === "function";
    this.name = name;
    // Do NOT inject a default terminator into config — undefined means "use default"
    // and is what gets passed when cloning chains. Injecting a function would make
    // cloned chains think they have a custom terminator (_hasCustomTerminator).
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
    this.chain.splice(idx, 0, cb);
  }

  delete(cb: Callback): void {
    const i = this.chain.indexOf(cb);
    if (i !== -1) this.chain.splice(i, 1);
  }

  append(callback: Callback): void {
    this.chain.push(callback);
  }

  prepend(callback: Callback): void {
    this.chain.unshift(callback);
  }

  remove(kind: CallbackKind, filter?: AnyCallback | string | symbol | CallbackObject): void {
    this.chain = this.chain.filter((cb) => !cb.matches(kind, filter));
  }

  clear(): void {
    this.chain = [];
  }

  compile(): CallbackSequence {
    return new CallbackSequence(this);
  }

  get isEmpty(): boolean {
    return this.chain.length === 0;
  }

  _invoke(
    target: object,
    block?: () => unknown,
    opts?: RunCallbacksOptions,
  ): boolean | Promise<boolean> {
    const terminatorFn = this.config.terminator;
    const skipAfterIfTerminated = this.config.skipAfterCallbacksIfTerminated ?? false;
    const befores = this.chain.filter((e) => e.kind === "before");
    const afters = this.chain.filter((e) => e.kind === "after");
    const arounds = this.chain.filter((e) => e.kind === "around");

    // ---- Before phase ----
    let halted = false;
    for (let i = 0; i < befores.length; i++) {
      const entry = befores[i];
      if (!Value.check(entry.options, target)) continue;
      const cb = entry.filter as BeforeCallback;
      // Capture cbResult as a side effect inside the terminator's fn() so the
      // terminator controls whether the callback runs at all (its API contract).
      let cbResult: unknown;
      let terminatorHalted = false;
      let aborted = false;
      if (terminatorFn === false) {
        cbResult = cb.call(target, target);
      } else if (terminatorFn) {
        // Custom terminator owns the halt decision. Rails scopes `catch(:abort)`
        // to the default terminator (callbacks.rb#default_terminator), so the
        // sentinel is NOT caught here — it propagates unless the terminator
        // itself catches it, matching Rails' caller-supplied terminator contract.
        terminatorHalted = terminatorFn(target, () => {
          cbResult = cb.call(target, target);
          return cbResult;
        });
      } else {
        // Default terminator: Rails wraps the call in `catch(:abort)`. Halt the
        // chain on the sentinel, no exception escapes; real errors propagate.
        try {
          cbResult = cb.call(target, target);
        } catch (e) {
          if (!isAbortSignal(e)) throw e;
          aborted = true;
        }
      }

      if (aborted) {
        halted = true;
        break;
      }

      if (isThenable(cbResult)) {
        if (opts?.strict === "sync") {
          swallowRejection(cbResult);
          // The `validate` chain is intentionally synchronous (Rails validations
          // run sync; `valid?`/`isValid` return a boolean, not a Promise). An
          // async validate callback is an authoring bug: rewrite it
          // synchronously (e.g. read a loaded association via its sync reader),
          // or, if the work is genuinely async, move it to a beforeSave /
          // afterSave callback — those chains run async.
          throw new Error(
            `Async callback on sync chain "${this.name}" — before returned a Promise. ` +
              `Validations are synchronous; move async work to a beforeSave/afterSave callback.`,
          );
        }
        // Custom terminators receive fn()'s return value to decide halting, but async
        // callbacks return a Promise — the terminator cannot await it to get the real
        // result. Fail fast rather than silently apply wrong halt logic.
        if (this._hasCustomTerminator) {
          swallowRejection(cbResult);
          throw new Error(
            `Async before callback on chain "${this.name}" is unsupported with a custom terminator. ` +
              `Custom terminators cannot evaluate Promise-returning callbacks. ` +
              `Use the default terminator (halt via throwAbort()) or make all before callbacks synchronous.`,
          );
        }
        const remaining = befores.slice(i + 1);
        // Default-terminator async halt is sentinel-only: an async before halts
        // by rejecting with the abort sentinel (handled in the catch blocks
        // below). A `false` resolution no longer halts, matching Rails 5+.
        return (async () => {
          try {
            await cbResult;
          } catch (e) {
            // Default terminator only (custom terminators already threw above;
            // `terminator: false` never halts, so it must NOT swallow abort —
            // Rails scopes `catch(:abort)` to the default terminator). An async
            // before rejecting with the sentinel halts; real errors propagate.
            if (!isAbortSignal(e) || terminatorFn === false) throw e;
            return this._runAfters(afters, true, skipAfterIfTerminated, target, opts, false);
          }
          for (const rem of remaining) {
            if (!Value.check(rem.options, target)) continue;
            // Invoke each remaining before through the terminator's lazy wrapper so
            // the terminator retains invocation control (it may choose not to call fn).
            let remVal: unknown;
            let remSyncHalt = false;
            try {
              if (terminatorFn === false) {
                remVal = (rem.filter as BeforeCallback).call(target, target);
              } else if (terminatorFn) {
                remSyncHalt = terminatorFn(target, () => {
                  remVal = (rem.filter as BeforeCallback).call(target, target);
                  return remVal;
                });
              } else {
                remVal = (rem.filter as BeforeCallback).call(target, target);
              }
            } catch (e) {
              if (!isAbortSignal(e) || terminatorFn === false) throw e;
              return this._runAfters(afters, true, skipAfterIfTerminated, target, opts, false);
            }
            try {
              if (isThenable(remVal)) await remVal;
            } catch (e) {
              if (!isAbortSignal(e) || terminatorFn === false) throw e;
              return this._runAfters(afters, true, skipAfterIfTerminated, target, opts, false);
            }
            if (remSyncHalt)
              return this._runAfters(afters, true, skipAfterIfTerminated, target, opts, false);
          }
          return this._runAroundAndAfter(
            arounds,
            afters,
            target,
            block,
            skipAfterIfTerminated,
            opts,
          );
        })();
      }

      if (terminatorFn === false) {
        // never halt
      } else if (terminatorFn && terminatorHalted) {
        // Default terminator halts ONLY on the abort sentinel (handled above via
        // `aborted`), matching Rails 5+ default_terminator. A `false` return no
        // longer halts. A custom terminator owns its own halt decision.
        halted = true;
        break;
      }
    }

    if (halted) return this._runAfters(afters, true, skipAfterIfTerminated, target, opts, false);
    return this._runAroundAndAfter(arounds, afters, target, block, skipAfterIfTerminated, opts);
  }

  private _runAfters(
    afters: Callback[],
    halted: boolean,
    skipIfTerminated: boolean,
    target: object,
    opts?: RunCallbacksOptions,
    // env.value (the run_callbacks block's return). After conditions read it —
    // ActiveModel's after-model-callback conditional skips when value === false.
    // Halted callers pass `false` (Rails sets env.value to false on halt); the
    // normal path passes the block's actual return, which may legitimately be
    // `undefined` (Rails nil — `nil != false` is true, so after callbacks run).
    value?: unknown,
  ): boolean | Promise<boolean> {
    if (halted && skipIfTerminated) return false;
    for (let i = afters.length - 1; i >= 0; i--) {
      const entry = afters[i];
      if (!Value.check(entry.options, target, value)) continue;
      const result = (entry.filter as AfterCallback).call(target, target);
      if (isThenable(result)) {
        if (opts?.strict === "sync") {
          swallowRejection(result);
          throw new Error(`Async callback on sync chain "${this.name}" — after returned a Promise`);
        }
        const remaining: Callback[] = [];
        for (let j = i - 1; j >= 0; j--) remaining.push(afters[j]);
        return (async () => {
          await result;
          for (const rem of remaining) {
            if (!Value.check(rem.options, target, value)) continue;
            await (rem.filter as AfterCallback).call(target, target);
          }
          return !halted;
        })();
      }
    }
    return !halted;
  }

  private _runAroundAndAfter(
    arounds: Callback[],
    afters: Callback[],
    target: object,
    block: (() => unknown) | undefined,
    skipAfterIfTerminated: boolean,
    opts?: RunCallbacksOptions,
  ): boolean | Promise<boolean> {
    let blockExecuted = false;
    // env.value — the block's return. Threaded into _runAfters so ActiveModel's
    // after-model-callback conditional (`v != false`) can skip after callbacks
    // when the block returned false, mirroring Rails callbacks.rb's
    // `env.value = !env.halted && (!block_given? || yield)`.
    let blockValue: unknown;
    const trackedBlock = (): void | Promise<void> => {
      // Track invocation, not successful completion: in Rails an around that
      // rescues an exception raised by yield still runs the outer invoke_after
      // (callbacks.rb#run_callbacks). Setting the flag here means a block
      // rejection caught by an around no longer looks like "around did not yield".
      blockExecuted = true;
      const r = block?.();
      if (isThenable(r)) {
        return Promise.resolve(r).then((v) => {
          blockValue = v;
        });
      }
      blockValue = r;
      return r as void | Promise<void>;
    };

    let chain: () => void | Promise<void> = trackedBlock;
    for (let i = arounds.length - 1; i >= 0; i--) {
      const entry = arounds[i];
      if (!Value.check(entry.options, target)) continue;
      const prev = chain;
      chain = () => {
        let pendingProceed: Promise<void> | undefined;
        let proceedObserved = false;
        const next = (): void | Promise<void> => {
          const r = prev();
          if (!isThenable(r)) return r;
          pendingProceed = Promise.resolve(r);
          // Return a thenable wrapper so we can detect whether the around
          // actually awaited/chained on next() (real observation) versus
          // calling it fire-and-forget. `await` and `.then(...)` both invoke
          // .then on the wrapper; bare `next();` does not.
          const observed = pendingProceed;
          return {
            then(onFulfilled?: any, onRejected?: any) {
              // Only mark observed when a rejection path is wired — `await`
              // internally passes an onRejected, `.then(_, r)` does too.
              // `.then(onFulfilled)` alone doesn't rescue, so the rejection
              // must still propagate via pendingProceed.
              if (typeof onRejected === "function") {
                proceedObserved = true;
                return observed.then(onFulfilled, onRejected);
              }
              const p = observed.then(onFulfilled);
              // Suppress unhandled-rejection on the unobserved chain; the
              // canonical propagation path is pendingProceed.
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
              // .finally does not rescue rejections — the rejection still
              // propagates through the returned promise. Don't mark observed.
              const p = observed.finally(onFinally);
              p.catch(() => {});
              return p;
            },
          } as unknown as Promise<void>;
        };
        let cbResult: void | Promise<void>;
        try {
          cbResult = (entry.filter as AroundCallback).call(target, target, next);
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
              `Async callback on sync chain "${this.name}" — around callback or block returned a Promise`,
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
              // Swallow only when the around actually observed next() (awaited
              // or chained). Fire-and-forget arounds couldn't have rescued, so
              // propagate the inner rejection.
              if (proceedObserved) await pendingProceed.catch(() => {});
              else await pendingProceed;
            }
          })();
        }
      };
    }

    const chainResult = chain();

    const finish = (): boolean | Promise<boolean> => {
      // Rails AS::Callbacks compiles arounds wrapping (befores + block + afters)
      // as a single continuation: a non-yielding around skips the afters too.
      if (!blockExecuted) return false;
      const afterResult = this._runAfters(
        afters,
        false,
        skipAfterIfTerminated,
        target,
        opts,
        blockValue,
      );
      if (isThenable(afterResult)) return Promise.resolve(afterResult).then(() => blockExecuted);
      return blockExecuted;
    };

    if (isThenable(chainResult)) {
      if (opts?.strict === "sync") {
        swallowRejection(chainResult);
        throw new Error(
          `Async callback on sync chain "${this.name}" — around callback or block returned a Promise`,
        );
      }
      return Promise.resolve(chainResult).then(finish);
    }
    return finish();
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

const _cond = { Value };
export namespace Conditionals {
  export const Value = _cond.Value;
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
    const isObj = typeof callback === "object" && callback !== null;
    const resolved = isObj ? resolveCallbackObject<T>(callback, kind, name) : callback;
    const entry = new Callback(
      name,
      resolved as AnyCallback,
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
  }

  return WithCallbacks;
}
