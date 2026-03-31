export type CallbackKind = "before" | "after" | "around";

export type CallbackCondition = (target: any) => boolean;

export interface CallbackOptions {
  if?: CallbackCondition | CallbackCondition[];
  unless?: CallbackCondition | CallbackCondition[];
  prepend?: boolean;
}

export interface DefineCallbacksOptions {
  terminator?: boolean;
}

export type BeforeCallback = (target: any) => any;
export type AfterCallback = (target: any) => void;
export type AroundCallback = (target: any, next: () => void) => void;
export type AnyCallback = BeforeCallback | AfterCallback | AroundCallback;

export class Callback {
  readonly kind: CallbackKind;
  readonly filter: AnyCallback;
  readonly options: CallbackOptions;
  readonly name: string;

  constructor(
    name: string,
    filter: AnyCallback,
    kind: CallbackKind,
    options: CallbackOptions = {},
  ) {
    this.name = name;
    this.filter = filter;
    this.kind = kind;
    this.options = options;
  }

  matches(kind: CallbackKind, filter?: AnyCallback): boolean {
    if (this.kind !== kind) return false;
    if (filter && this.filter !== filter) return false;
    return true;
  }

  apply(target: any, block?: () => void): boolean {
    if (!Value.check(this.options, target)) return true;

    if (this.kind === "before") {
      return (this.filter as BeforeCallback)(target) !== false;
    } else if (this.kind === "after") {
      (this.filter as AfterCallback)(target);
      return true;
    } else if (this.kind === "around") {
      if (!block) {
        throw new Error("Around callbacks require a block/next function");
      }
      (this.filter as AroundCallback)(target, block);
      return true;
    }
    return true;
  }
}

export class CallbackChain {
  readonly name: string;
  readonly config: DefineCallbacksOptions;
  private chain: Callback[];

  constructor(name: string, config: DefineCallbacksOptions = {}) {
    this.name = name;
    this.config = { terminator: true, ...config };
    this.chain = [];
  }

  get entries(): Callback[] {
    return this.chain;
  }

  append(callback: Callback): void {
    this.chain.push(callback);
  }

  prepend(callback: Callback): void {
    this.chain.unshift(callback);
  }

  remove(kind: CallbackKind, filter?: AnyCallback): void {
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
}

export class CallbackSequence {
  private readonly callbackChain: CallbackChain;

  constructor(callbackChain: CallbackChain) {
    this.callbackChain = callbackChain;
  }

  invoke(target: any, block?: () => void): boolean {
    const entries = this.callbackChain.entries;
    const terminator = this.callbackChain.config.terminator !== false;

    const befores = entries.filter((e) => e.kind === "before");
    const afters = entries.filter((e) => e.kind === "after");
    const arounds = entries.filter((e) => e.kind === "around");

    for (const entry of befores) {
      if (!Value.check(entry.options, target)) continue;
      const result = (entry.filter as BeforeCallback)(target);
      if (terminator && result === false) return false;
    }

    let core = () => {
      block?.();
    };

    for (let i = arounds.length - 1; i >= 0; i--) {
      const entry = arounds[i];
      const inner = core;
      if (!Value.check(entry.options, target)) continue;
      core = () => {
        (entry.filter as AroundCallback)(target, inner);
      };
    }

    core();

    for (let i = afters.length - 1; i >= 0; i--) {
      const entry = afters[i];
      if (!Value.check(entry.options, target)) continue;
      (entry.filter as AfterCallback)(target);
    }

    return true;
  }
}

export class MethodCall {
  constructor(readonly methodName: string) {}

  make(target: any, _value: any): any {
    return target[this.methodName]?.call(target);
  }
}

export class ObjectCall {
  constructor(
    readonly target: any,
    readonly methodName: string,
  ) {}

  make(instance: any, _value: any): any {
    return this.target[this.methodName]?.call(this.target, instance);
  }
}

export class InstanceExec0 {
  constructor(readonly fn: () => any) {}

  make(target: any, _value: any): any {
    return this.fn.call(target);
  }
}

export class InstanceExec1 {
  constructor(readonly fn: (target: any) => any) {}

  make(target: any, _value: any): any {
    return this.fn(target);
  }
}

export class InstanceExec2 {
  constructor(readonly fn: (target: any, value: any) => any) {}

  make(target: any, value: any): any {
    return this.fn(target, value);
  }
}

export class ProcCall {
  constructor(readonly fn: (...args: any[]) => any) {}

  make(target: any, _value: any): any {
    return this.fn(target);
  }
}

export class Value {
  static check(options: CallbackOptions, target: any): boolean {
    if (options.if) {
      const conditions = Array.isArray(options.if) ? options.if : [options.if];
      if (!conditions.every((cond) => cond(target))) return false;
    }
    if (options.unless) {
      const conditions = Array.isArray(options.unless) ? options.unless : [options.unless];
      if (conditions.some((cond) => cond(target))) return false;
    }
    return true;
  }
}

export class Before {
  static build(callback: Callback, _options: DefineCallbacksOptions): (target: any) => boolean {
    const terminator = _options.terminator !== false;
    return (target: any) => {
      if (!Value.check(callback.options, target)) return true;
      const result = (callback.filter as BeforeCallback)(target);
      return !(terminator && result === false);
    };
  }
}

export class After {
  static build(callback: Callback): (target: any) => void {
    return (target: any) => {
      if (!Value.check(callback.options, target)) return;
      (callback.filter as AfterCallback)(target);
    };
  }
}

export class Around {
  static build(callback: Callback): (target: any, block: () => void) => void {
    return (target: any, block: () => void) => {
      if (!Value.check(callback.options, target)) {
        block();
        return;
      }
      (callback.filter as AroundCallback)(target, block);
    };
  }
}

export const CallTemplate = {
  MethodCall,
  ObjectCall,
  InstanceExec0,
  InstanceExec1,
  InstanceExec2,
  ProcCall,
};

export const Conditionals = { Value };

export const Filters = { Before, After, Around };

export interface ClassMethods {
  defineCallbacks(name: string, options?: DefineCallbacksOptions): void;
  beforeCallback(name: string, callback: BeforeCallback, options?: CallbackOptions): void;
  afterCallback(name: string, callback: AfterCallback, options?: CallbackOptions): void;
  aroundCallback(name: string, callback: AroundCallback, options?: CallbackOptions): void;
  skipCallback(name: string, kind: CallbackKind, callback?: AnyCallback): void;
  resetCallbacks(name: string): void;
}

const CALLBACKS = Symbol("callbacks");

function getCallbackChains(target: any): Map<string, CallbackChain> {
  if (!Object.prototype.hasOwnProperty.call(target, CALLBACKS)) {
    const parent: Map<string, CallbackChain> | undefined = target[CALLBACKS];
    const own = new Map<string, CallbackChain>();
    if (parent) {
      for (const [name, chain] of parent) {
        own.set(name, new CallbackChain(chain.name, chain.config));
        for (const entry of chain.entries) {
          own.get(name)!.append(new Callback(entry.name, entry.filter, entry.kind, entry.options));
        }
      }
    }
    target[CALLBACKS] = own;
  }
  return target[CALLBACKS];
}

export namespace Callbacks {
  export function defineCallbacks(
    target: any,
    name: string,
    options: DefineCallbacksOptions = {},
  ): void {
    const chains = getCallbackChains(target);
    if (!chains.has(name)) {
      chains.set(name, new CallbackChain(name, options));
    }
  }

  export function setCallback(
    target: any,
    name: string,
    kind: CallbackKind,
    callback: AnyCallback,
    options: CallbackOptions = {},
  ): void {
    const chains = getCallbackChains(target);
    const chain = chains.get(name);
    if (!chain) {
      throw new Error(`No callback chain "${name}" defined. Call defineCallbacks first.`);
    }
    const entry = new Callback(name, callback, kind, options);
    if (options.prepend) {
      chain.prepend(entry);
    } else {
      chain.append(entry);
    }
  }

  export function skipCallback(
    target: any,
    name: string,
    kind: CallbackKind,
    callback?: AnyCallback,
  ): void {
    const chains = getCallbackChains(target);
    const chain = chains.get(name);
    if (!chain) return;
    chain.remove(kind, callback);
  }

  export function resetCallbacks(target: any, name: string): void {
    const chains = getCallbackChains(target);
    const chain = chains.get(name);
    if (chain) chain.clear();
  }

  export function runCallbacks(target: any, name: string, block?: () => void): boolean {
    const chains = getCallbackChains(target);
    const chain = chains.get(name);
    if (!chain) {
      block?.();
      return true;
    }
    const sequence = chain.compile();
    return sequence.invoke(target, block);
  }
}

export function defineCallbacks(
  target: any,
  name: string,
  options: DefineCallbacksOptions = {},
): void {
  Callbacks.defineCallbacks(target, name, options);
}

export function setCallback(
  target: any,
  name: string,
  kind: CallbackKind,
  callback: AnyCallback,
  options: CallbackOptions = {},
): void {
  Callbacks.setCallback(target, name, kind, callback, options);
}

export function skipCallback(
  target: any,
  name: string,
  kind: CallbackKind,
  callback?: AnyCallback,
): void {
  Callbacks.skipCallback(target, name, kind, callback);
}

export function resetCallbacks(target: any, name: string): void {
  Callbacks.resetCallbacks(target, name);
}

export function runCallbacks(target: any, name: string, block?: () => void): boolean {
  return Callbacks.runCallbacks(target, name, block);
}

export function CallbacksMixin<TBase extends new (...args: any[]) => object>(Base?: TBase) {
  const ActualBase = (Base ?? class {}) as TBase;

  class WithCallbacks extends ActualBase {
    static defineCallbacks(name: string, options: DefineCallbacksOptions = {}): void {
      defineCallbacks(this.prototype, name, options);
    }

    static beforeCallback(
      name: string,
      callback: BeforeCallback,
      options: CallbackOptions = {},
    ): void {
      setCallback(this.prototype, name, "before", callback, options);
    }

    static afterCallback(
      name: string,
      callback: AfterCallback,
      options: CallbackOptions = {},
    ): void {
      setCallback(this.prototype, name, "after", callback, options);
    }

    static aroundCallback(
      name: string,
      callback: AroundCallback,
      options: CallbackOptions = {},
    ): void {
      setCallback(this.prototype, name, "around", callback, options);
    }

    static skipCallback(name: string, kind: CallbackKind, callback?: AnyCallback): void {
      skipCallback(this.prototype, name, kind, callback);
    }

    static resetCallbacks(name: string): void {
      resetCallbacks(this.prototype, name);
    }

    runCallbacks(name: string, block?: () => void): boolean {
      return runCallbacks(this, name, block);
    }
  }

  return WithCallbacks;
}
