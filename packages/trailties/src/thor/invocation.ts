import {
  extend,
  flatten,
  Hash,
  included,
  initialize,
  isModuleIncluded,
  merge,
  mergeBang,
  Module,
  rbFCaller,
  rbModToS,
  rbObjAsString,
  rbObjDup,
  rtest,
  RuntimeError,
  toS,
  toSym,
  warn,
} from "@blazetrails/ruby-compat";
import { Base, type BaseClass, type BaseConfig } from "./base.js";
import type { Command } from "./command.js";
import { findClassAndCommandByNamespace } from "./util.js";

type Invocations = Hash<unknown, string[]>;

export interface Invocation {
  /** @internal */
  _invocations: Invocations;
  /** @internal */
  _initializer: [unknown[], unknown, BaseConfig];
  currentCommandChain: OmitThisParameter<typeof currentCommandChain>;
  invoke: OmitThisParameter<typeof invoke>;
  invokeCommand: OmitThisParameter<typeof invokeCommand>;
  invokeTask: OmitThisParameter<typeof invokeCommand>;
  invokeAll: OmitThisParameter<typeof invokeAll>;
  invokeWithPadding: OmitThisParameter<typeof invokeWithPadding>;
  /** @internal */
  _sharedConfiguration: OmitThisParameter<typeof _sharedConfiguration>;
  /** @internal */
  _retrieveClassAndCommand: OmitThisParameter<typeof _retrieveClassAndCommand>;
  /** @internal */
  _retrieveClassAndTask: OmitThisParameter<typeof _retrieveClassAndCommand>;
  /** @internal */
  _parseInitializationOptions: OmitThisParameter<typeof _parseInitializationOptions>;
}

type InvocationHost = Invocation & { options: unknown; withPadding<T>(block: () => T): T };

type InvocationClass = BaseClass & {
  prepareForInvocation(key: unknown, name: unknown): unknown;
  dispatch(
    command: unknown,
    givenArgs: unknown,
    givenOpts: unknown,
    config: BaseConfig,
    block: (instance: { parentOptions: unknown }) => void,
  ): unknown;
};

export const ClassMethods = {
  prepareForInvocation(key: unknown, name: unknown): unknown {
    if (typeof name === "string") {
      return findClassAndCommandByNamespace(toS(name), !rtest(key));
    } else {
      return name;
    }
  },
};

function currentCommandChain(this: Invocation): string[] {
  return flatten(Array.from(this._invocations.values())).map(toSym);
}

async function invoke(this: InvocationHost, name: unknown = null, ...args: unknown[]) {
  if (name == null) {
    warn(
      `[Thor] Calling invoke() without argument is deprecated. Please use invoke_all instead.\n${rbFCaller().join("\n")}`,
    );
    return this.invokeAll();
  }

  if (Array.isArray(args[0]) || args[0] == null) args.unshift(null);
  let command: unknown, opts: unknown, config: unknown;
  [command, args, opts, config] = args as [unknown, unknown[], unknown, unknown];

  const retrieved = this._retrieveClassAndCommand(name, command);
  const klass = retrieved[0];
  command = retrieved[1];
  if (!rtest(klass)) throw new RuntimeError(`Missing Thor class for invoke ${rbObjAsString(name)}`);
  if (!isModuleIncluded(klass as BaseClass, Base)) {
    throw new RuntimeError(`Expected Thor class, got ${rbModToS(klass as never)}`);
  }

  [args, opts, config] = this._parseInitializationOptions(args, opts, config);
  return (klass as InvocationClass).dispatch(
    command,
    args,
    opts,
    config as BaseConfig,
    (instance) => {
      instance.parentOptions = this.options;
    },
  );
}

async function invokeCommand(this: Invocation, command: Command, ...args: unknown[]) {
  const current = this._invocations.get(this.constructor)!;

  if (!current.includes(command.name)) {
    current.push(command.name);
    return command.run(this as never, ...(args as [unknown[]?]));
  }
}

export const invokeTask = invokeCommand;

async function invokeAll(this: Invocation): Promise<unknown[]> {
  const result: unknown[] = [];
  for (const command of Object.values((this.constructor as unknown as BaseClass).allCommands())) {
    result.push(await this.invokeCommand(command));
  }
  return result;
}

function invokeWithPadding(this: InvocationHost, ...args: unknown[]) {
  return this.withPadding(() => this.invoke(...args));
}

/** @internal */
function _sharedConfiguration(this: Invocation): Record<string, unknown> {
  return { invocations: this._invocations };
}

/** @internal */
function _retrieveClassAndCommand(
  this: Invocation,
  name: unknown,
  sentCommand: unknown = null,
): [unknown, unknown] {
  const self = this.constructor as unknown as InvocationClass;
  if (name == null) {
    return [self, null];
  } else if (rtest(self.allCommands()[toS(name)])) {
    return [self, toS(name)];
  } else {
    const prepared = self.prepareForInvocation(null, name);
    const [klass, command] = Array.isArray(prepared) ? prepared : [prepared];
    return [klass, rtest(command) ? command : sentCommand];
  }
}

/** @internal */
export const _retrieveClassAndTask = _retrieveClassAndCommand;

/** @internal */
function _parseInitializationOptions(
  this: Invocation,
  args: unknown,
  opts: unknown,
  config: unknown,
): [unknown[], unknown, BaseConfig] {
  const [storedArgs, storedOpts, storedConfig] = this._initializer;

  args ||= rbObjDup(storedArgs);
  opts ||= rbObjDup(storedOpts);

  config ||= {};
  config = mergeBang(merge(storedConfig, this._sharedConfiguration()), config as BaseConfig);

  return [args as unknown[], opts, config as BaseConfig];
}

export const Invocation = new Module((mod) => {
  (mod as unknown as Record<symbol, unknown>)[included] = function (base: object): void {
    extend(base, ClassMethods);
  };

  (mod as unknown as Record<symbol, unknown>)[initialize] = function* (
    this: Invocation,
    args: unknown[] = [],
    options: unknown = {},
    config: BaseConfig = {},
  ): Generator<void, void, void> {
    this._invocations =
      (config.invocations as Invocations | undefined) ||
      new Hash<unknown, string[]>((h, k) => {
        const v: string[] = [];
        h.set(k, v);
        return v;
      });
    this._initializer = [args, options, config];
    yield;
  };

  mod.moduleEval((m) => {
    Object.assign(m, {
      currentCommandChain,
      invoke,
      invokeCommand,
      invokeTask,
      invokeAll,
      invokeWithPadding,
      _sharedConfiguration,
      _retrieveClassAndCommand,
      _retrieveClassAndTask,
      _parseInitializationOptions,
    });
  });
}) as Module & { ClassMethods: typeof ClassMethods };
Invocation.ClassMethods = ClassMethods;
