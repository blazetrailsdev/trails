import { STDIN } from "./io.js";
import { format } from "./kernel-format.js";
import { TopLevel } from "./object.js";
import { env, exit } from "./process-adapter.js";
import { extend } from "./include.js";
import { StandardError } from "./standard-error.js";
import { LoadError } from "./load-error.js";

export interface ReplServerLike {
  context: Record<string, unknown>;
  on(event: "exit", listener: () => void): unknown;
}

export interface ReplAdapter {
  start(options: { prompt: string; useGlobal: boolean }): ReplServerLike;
}

const registry = new Map<string, ReplAdapter>();

/** @noRailsEquivalent PERMANENT */
export const replAdapterConfig: { adapter: string } = { adapter: "node" };

/** @noRailsEquivalent PERMANENT */
export function registerReplAdapter(name: string, adapter: ReplAdapter): void {
  registry.set(name, adapter);
}

/** @noRailsEquivalent PERMANENT */
export async function getReplAsync(): Promise<ReplAdapter> {
  const name = replAdapterConfig.adapter;
  if (!registry.has(name) && name === "node") {
    const proc = (globalThis as { process?: { getBuiltinModule?(id: string): unknown } }).process;
    const repl = proc?.getBuiltinModule?.("node:repl");
    if (repl != null) registry.set("node", repl as ReplAdapter);
  }
  const adapter = registry.get(name);
  if (adapter == null) throw new LoadError(`cannot load such file -- ${name}`);
  return adapter;
}

type PromptConf = Record<string, string | boolean | null>;

/**
 * `IRB::UndefinedPromptMode` (`vendor/ruby/v3.3.11/lib/irb/lc/error.rb:45-49`).
 *
 * @noRailsEquivalent PERMANENT
 */
export class UndefinedPromptMode extends StandardError {
  /** @noRailsEquivalent PERMANENT */
  constructor(val: unknown) {
    super(`Undefined prompt mode(${String(val)}).`);
  }
}

/**
 * `IRB::HelperMethod::Base` (`vendor/ruby/v3.3.11/lib/irb/helper_method/base.rb:4-15`).
 * `include Singleton` is `instance`, memoized per class.
 *
 * @noRailsEquivalent PERMANENT
 */
export class HelperMethodBase {
  static _description: string | null;
  static _instance: HelperMethodBase | undefined;

  /** @noRailsEquivalent PERMANENT */
  static description(description: string | null = null): string | null {
    if (description != null) this._description = description;
    return Object.hasOwn(this, "_description") ? this._description : null;
  }

  /** @noRailsEquivalent PERMANENT */
  static instance<T extends HelperMethodBase>(this: new () => T): T {
    const klass = this as unknown as typeof HelperMethodBase;
    if (!Object.hasOwn(klass, "_instance")) klass._instance = new this();
    return klass._instance as T;
  }
}

type HelperClass = typeof HelperMethodBase & (new () => { execute(...args: unknown[]): unknown });

/**
 * `IRB::HelperMethod` (`vendor/ruby/v3.3.11/lib/irb/helper_method.rb:3-28`).
 *
 * @noRailsEquivalent PERMANENT
 */
export const HelperMethod = {
  Base: HelperMethodBase,
  helperMethods: {} as Record<string, HelperClass>,

  /** @noRailsEquivalent PERMANENT */
  register(name: string, helperClass: HelperClass): void {
    HelperMethod.helperMethods[name] = helperClass;

    HelpersContainer.installHelperMethods();
  },
};

/**
 * `IRB::HelpersContainer` (`vendor/ruby/v3.3.11/lib/irb/workspace.rb:178-188`).
 *
 * @noRailsEquivalent PERMANENT
 */
export const HelpersContainer: Record<string, unknown> & { installHelperMethods(): void } =
  Object.defineProperty({} as Record<string, unknown>, "installHelperMethods", {
    value(): void {
      for (const [name, helperMethodClass] of Object.entries(HelperMethod.helperMethods)) {
        if (Object.hasOwn(HelpersContainer, name)) continue;
        HelpersContainer[name] = (...args: unknown[]) =>
          helperMethodClass.instance().execute(...args);
      }
    },
  }) as Record<string, unknown> & { installHelperMethods(): void };

/**
 * `IRB::Irb` (`vendor/ruby/v3.3.11/lib/irb.rb:920`), over the REPL adapter.
 * Its workspace is a REPL context whose missed reads resolve through
 * `TopLevel`, as IRB's `TOPLEVEL_BINDING` resolves a constant through
 * `Object`.
 *
 * @noRailsEquivalent PERMANENT
 */
export class Irb {
  /** @noRailsEquivalent PERMANENT */
  context: { irbName: string; main: string };
  /** @noRailsEquivalent PERMANENT */
  lineNo: number;

  /** @noRailsEquivalent PERMANENT */
  constructor() {
    this.context = { irbName: IRB.conf.IRB_NAME as string, main: "main" };
    this.lineNo = 1;
  }

  /**
   * `IRB::Irb#run` (`vendor/ruby/v3.3.11/lib/irb.rb:998-1035`).
   * History and the `SIGINT` trap are the REPL adapter's own.
   *
   * @noRailsEquivalent PERMANENT
   */
  async run(conf: Record<string, unknown> = IRB.conf): Promise<void> {
    if (conf.IRB_RC != null) (conf.IRB_RC as (context: unknown) => void)(this.context);
    const prevContext = conf.MAIN_CONTEXT;
    conf.MAIN_CONTEXT = this.context;

    let forcedExit = false;
    try {
      forcedExit = await this.evalInput();
    } finally {
      if (prevContext != null) IRB.conf.MAIN_CONTEXT = prevContext;
      for (const hook of conf.AT_EXIT as Array<() => void>) hook();
      if (forcedExit) exit();
    }
  }

  /**
   * `IRB::Irb#eval_input` (`vendor/ruby/v3.3.11/lib/irb.rb:1038`), run by the
   * REPL. It answers what `catch(:IRB_EXIT)` caught: the REPL's `.exit` and
   * EOF both close it, and both are `irb_exit` (`irb.rb:908-910`).
   *
   * @noRailsEquivalent PERMANENT
   */
  async evalInput(): Promise<boolean> {
    const pconf = (IRB.conf.PROMPT as Record<string, PromptConf>)[IRB.conf.PROMPT_MODE as string];
    const prompt = this.formatPrompt((pconf.PROMPT_I as string | null) ?? "", null, 0, this.lineNo);
    const repl = await getReplAsync();
    const server = repl.start({ prompt, useGlobal: false });
    this.loadHelperMethodsToMain(server);
    await new Promise<void>((resolve) => server.on("exit", () => resolve()));
    return true;
  }

  /**
   * `IRB::WorkSpace#load_helper_methods_to_main`
   * (`vendor/ruby/v3.3.11/lib/irb/workspace.rb:113-117`). Main is the REPL
   * context. Above its singleton class sits `Object`: `Object.prototype`
   * with `TopLevel`'s constants read first, so a name main and
   * `HelpersContainer` lack resolves as a constant of `Object` does at
   * `TOPLEVEL_BINDING`. `TopLevel` has no prototype and a JS object has
   * one, so the two are joined by a Proxy over `Object.prototype`.
   *
   * @noRailsEquivalent PERMANENT
   */
  loadHelperMethodsToMain(server: ReplServerLike): void {
    const main = server.context;
    extend(main, HelpersContainer);
    const top = TopLevel as Record<string, unknown>;
    Object.setPrototypeOf(
      Object.getPrototypeOf(main),
      new Proxy(Object.prototype, {
        get: (target, key, receiver) =>
          typeof key === "string" && Object.hasOwn(top, key)
            ? top[key]
            : Reflect.get(target, key, receiver),
        has: (target, key) =>
          (typeof key === "string" && Object.hasOwn(top, key)) || Reflect.has(target, key),
      }),
    );
  }

  /**
   * `IRB::Irb#format_prompt` (`vendor/ruby/v3.3.11/lib/irb.rb:1481-1518`).
   *
   * @noRailsEquivalent PERMANENT
   */
  formatPrompt(fmt: string, ltype: string | null, indent: number, lineNo: number): string {
    return fmt.replace(/%([0-9]+)?([a-zA-Z%])/g, (_m, w: string | undefined, c: string) => {
      switch (c) {
        case "N":
          return this.context.irbName;
        case "m":
        case "M":
          return this.context.main;
        case "l":
          return ltype ?? "";
        case "i":
          if (indent < 0) return w != null ? "-".padStart(Number(w)) : "-";
          return w != null ? format(`%${w}d`, indent) : String(indent);
        case "n":
          return w != null ? format(`%${w}d`, lineNo) : String(lineNo);
        case "%":
          return w == null ? "%" : "";
        default:
          return "";
      }
    });
  }
}

/**
 * `IRB` (`vendor/ruby/v3.3.11/lib/irb/init.rb:7-17`).
 *
 * @noRailsEquivalent PERMANENT
 */
export const IRB = {
  conf: {} as Record<string, unknown>,
  INITIALIZED: false,
  Irb,
  HelperMethod,
  UndefinedPromptMode,

  /**
   * `IRB.setup` (`vendor/ruby/v3.3.11/lib/irb/init.rb:50-61`).
   * `init_error`, `parse_opts`, `run_config` and `load_modules` are not
   * ported: the REPL adapter reads no `.irbrc`, argv or locale.
   *
   * @noRailsEquivalent PERMANENT
   */
  setup(apPath: string | null): void {
    IRB.initConfig(apPath);

    const conf = IRB.conf as { PROMPT: Record<string, unknown>; PROMPT_MODE: string };
    if (conf.PROMPT[conf.PROMPT_MODE] == null) {
      throw new UndefinedPromptMode(conf.PROMPT_MODE);
    }
    IRB.INITIALIZED = true;
  },

  /**
   * `IRB.init_config` (`vendor/ruby/v3.3.11/lib/irb/init.rb:64-189`).
   * `VERSION`, `AP_NAME`, `IRB_LIB_PATH`, `MEASURE_PROC`, `LC_MESSAGES` and
   * `COMMAND_ALIASES` name irb's own files and commands, which the REPL
   * adapter has none of.
   *
   * @noRailsEquivalent PERMANENT
   */
  initConfig(_apPath: string | null): void {
    const conf = IRB.conf;
    conf.IRB_NAME = "irb";

    conf.RC = true;
    conf.LOAD_MODULES = [];
    conf.IRB_RC = null;

    const nc = env.NO_COLOR;
    conf.USE_COLORIZE = nc == null || nc === "";
    conf.USE_AUTOCOMPLETE =
      (Object.hasOwn(env, "IRB_USE_AUTOCOMPLETE") ? env.IRB_USE_AUTOCOMPLETE : "true") !== "false";
    conf.COMPLETOR = Object.hasOwn(env, "IRB_COMPLETOR") ? env.IRB_COMPLETOR : "regexp";
    conf.INSPECT_MODE = true;
    conf.USE_TRACER = false;
    conf.USE_LOADER = false;
    conf.IGNORE_SIGINT = true;
    conf.IGNORE_EOF = false;
    conf.USE_PAGER = true;
    conf.EXTRA_DOC_DIRS = [];
    conf.ECHO = null;
    conf.ECHO_ON_ASSIGNMENT = null;
    conf.VERBOSE = null;

    conf.EVAL_HISTORY = null;
    conf.SAVE_HISTORY = 1000;

    conf.BACK_TRACE_LIMIT = 16;

    conf.PROMPT = {
      NULL: { PROMPT_I: null, PROMPT_S: null, PROMPT_C: null, RETURN: "%s\n" },
      DEFAULT: {
        PROMPT_I: "%N(%m):%03n> ",
        PROMPT_S: "%N(%m):%03n%l ",
        PROMPT_C: "%N(%m):%03n* ",
        RETURN: "=> %s\n",
      },
      CLASSIC: {
        PROMPT_I: "%N(%m):%03n:%i> ",
        PROMPT_S: "%N(%m):%03n:%i%l ",
        PROMPT_C: "%N(%m):%03n:%i* ",
        RETURN: "%s\n",
      },
      SIMPLE: { PROMPT_I: ">> ", PROMPT_S: "%l> ", PROMPT_C: "?> ", RETURN: "=> %s\n" },
      INF_RUBY: {
        PROMPT_I: "%N(%m):%03n> ",
        PROMPT_S: null,
        PROMPT_C: null,
        RETURN: "%s\n",
        AUTO_INDENT: true,
      },
      XMP: { PROMPT_I: null, PROMPT_S: null, PROMPT_C: null, RETURN: "    ==>%s\n" },
    };
    conf.PROMPT_MODE = STDIN.isTty() ? "DEFAULT" : "NULL";
    conf.AUTO_INDENT = true;

    conf.CONTEXT_MODE = 4;
    conf.SINGLE_IRB = false;

    conf.MEASURE = false;
    conf.MEASURE_CALLBACKS = [];

    conf.AT_EXIT = [];
  },
};
