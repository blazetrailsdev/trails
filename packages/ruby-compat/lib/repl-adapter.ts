import { format } from "./kernel-format.js";
import { TopLevel } from "./object.js";
import { rbAutoloadLoad } from "./variable.js";
import { env, exit } from "./process-adapter.js";
import { extend } from "./include.js";
import { StandardError } from "./standard-error.js";
import { LoadError } from "./load-error.js";
import { kernelCatch, throwDataP } from "./kernel-catch.js";
import { File } from "./file.js";
import { STDIN, STDOUT } from "./io.js";

export interface ReplServerLike {
  context: Record<string, unknown>;
  on(event: "exit", listener: () => void): unknown;
  close(): void;
  eval: (
    cmd: string,
    context: object,
    file: string,
    callback: (err: Error | null, result?: unknown) => void,
  ) => void;
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
export const HelpersContainer = Object.defineProperty({}, "installHelperMethods", {
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
export class Tsrepl {
  /** @noRailsEquivalent PERMANENT */
  context: { irbName: string; main: string };
  /** @noRailsEquivalent PERMANENT */
  lineNo: number;
  /** @noRailsEquivalent PERMANENT */
  binding: ((statements: string, file: string) => Promise<unknown>) | null = null;

  /** @noRailsEquivalent PERMANENT */
  constructor() {
    this.context = { irbName: TSREPL.conf.TSREPL_NAME as string, main: "main" };
    this.lineNo = 1;
  }

  /**
   * `IRB::Irb#run` (`vendor/ruby/v3.3.11/lib/irb.rb:998-1035`).
   * History and the `SIGINT` trap are the REPL adapter's own.
   *
   * @noRailsEquivalent PERMANENT
   */
  async run(conf: Record<string, unknown> = TSREPL.conf): Promise<void> {
    if (conf.TSREPL_RC != null) (conf.TSREPL_RC as (context: unknown) => void)(this.context);
    const prevContext = conf.MAIN_CONTEXT;
    conf.MAIN_CONTEXT = this.context;

    let forcedExit: unknown = null;
    try {
      forcedExit = await kernelCatch("IRB_EXIT", () => this.evalInput());
    } finally {
      if (prevContext != null) TSREPL.conf.MAIN_CONTEXT = prevContext;
      for (const hook of conf.AT_EXIT as Array<() => void>) hook();
      if (forcedExit != null && forcedExit !== false) exit();
    }
  }

  /**
   * `IRB::Irb#eval_input` (`vendor/ruby/v3.3.11/lib/irb.rb:1038-1080`), over
   * the REPL. `each_top_level_statement` is the loop below: the REPL queues
   * each statement and this body evaluates it, so a `throw :IRB_EXIT` from
   * the statement unwinds through here to `run`'s `catch`, and EOF (the REPL
   * closing) ends the loop and returns normally.
   *
   * @noRailsEquivalent PERMANENT
   */
  async evalInput(): Promise<void> {
    const pconf = (TSREPL.conf.PROMPT as Record<string, PromptConf>)[
      TSREPL.conf.PROMPT_MODE as string
    ];
    const prompt = this.formatPrompt((pconf.PROMPT_I as string | null) ?? "", null, 0, this.lineNo);
    const repl = await getReplAsync();
    const server = repl.start({ prompt, useGlobal: true });
    this.loadHelperMethodsToMain(server);
    const evalDefault = server.eval;
    this.binding = (statements, file) =>
      new Promise((resolve, reject) =>
        evalDefault.call(server, statements, server.context, file, (err, result) =>
          err ? reject(err) : resolve(result),
        ),
      );
    const statements: Array<[string, string, (err: Error | null, result?: unknown) => void]> = [];
    let closed = false;
    let wake: (() => void) | null = null;
    server.eval = (statement, _context, file, callback) => {
      statements.push([statement, file, callback]);
      wake?.();
    };
    server.on("exit", () => {
      closed = true;
      wake?.();
    });
    for (;;) {
      const next = statements.shift();
      if (next == null) {
        if (closed) return;
        await new Promise<void>((resolve) => (wake = resolve));
        wake = null;
        continue;
      }
      const [statement, file, callback] = next;
      let result: unknown;
      try {
        result = await this.evaluate(statement, file);
      } catch (error) {
        if (throwDataP(error)) {
          server.close();
          throw error;
        }
        callback(error as Error);
        continue;
      }
      callback(null, result);
    }
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
   * `IRB::WorkSpace#evaluate` (`vendor/ruby/v3.3.11/lib/irb/workspace.rb:120-122`):
   * `eval(statements, @binding, file)`, with the REPL's own evaluator as the
   * binding. Ruby's `eval` loads a pending autoload when it looks the constant
   * up (`rb_autoload_load`, `vendor/ruby/v3.3.11/variable.c:3045`). That load
   * is awaited, so first each capitalized name the statements contain that is
   * not a property read (`x.Name`) and is still pending under `Object` is
   * loaded. The scan reads text, so a name inside a string or comment loads
   * too; for `A.B` only `A` loads here, and `B` loads with `A`'s namespace.
   *
   * @noRailsEquivalent PERMANENT
   */
  async evaluate(statements: string, file: string): Promise<unknown> {
    for (const [name] of statements.matchAll(/(?<![.\w$])[A-Z][\w$]*/g)) {
      if (!Object.hasOwn(TopLevel, name)) await rbAutoloadLoad(Object, name);
    }
    return this.binding!(statements, file);
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
export const TSREPL = {
  conf: {} as Record<string, unknown>,
  INITIALIZED: false,
  Tsrepl,
  HelperMethod,

  /**
   * `IRB.setup` (`vendor/ruby/v3.3.11/lib/irb/init.rb:50-61`).
   * `init_error`, `parse_opts`, `run_config` and `load_modules` are not
   * ported: the REPL adapter reads no `.irbrc`, argv or locale.
   *
   * @noRailsEquivalent PERMANENT
   */
  setup(apPath: string | null): void {
    TSREPL.initConfig(apPath);

    const conf = TSREPL.conf as { PROMPT: Record<string, unknown>; PROMPT_MODE: string };
    if (conf.PROMPT[conf.PROMPT_MODE] == null) {
      throw new UndefinedPromptMode(conf.PROMPT_MODE);
    }
    TSREPL.INITIALIZED = true;
  },

  /** `IRB::VERSION` (`vendor/ruby/v3.3.11/lib/irb/version.rb:8-10`). */
  VERSION: "1.13.1",
  RELEASE_VERSION: "1.13.1",
  LAST_UPDATE_DATE: "2024-05-05",

  /**
   * `IRB.version` (`vendor/ruby/v3.3.11/lib/irb/init.rb:41-43`).
   *
   * @noRailsEquivalent PERMANENT
   */
  version(): string {
    return format("tsrepl %s (%s)", TSREPL.RELEASE_VERSION, TSREPL.LAST_UPDATE_DATE);
  },

  /**
   * `IRB.init_config` (`vendor/ruby/v3.3.11/lib/irb/init.rb:64-189`).
   * `IRB_LIB_PATH`, `MEASURE_PROC[:STACKPROF]` and `LC_MESSAGES` name irb's
   * own files, the stackprof gem and irb's message catalogue, which the REPL
   * adapter has none of; `USE_SINGLELINE` is `false` because no
   * `ReadlineInputMethod` is defined.
   *
   * @noRailsEquivalent PERMANENT
   */
  initConfig(apPath: string | null): void {
    const conf = TSREPL.conf;
    if (!(apPath != null && conf.AP_NAME != null)) {
      apPath = "tsrepl.ts";
    }
    conf.VERSION = TSREPL.version();
    conf.AP_NAME = File.basename(apPath, ".ts");

    conf.TSREPL_NAME = "tsrepl";

    conf.RC = true;
    conf.LOAD_MODULES = [];
    conf.TSREPL_RC = null;

    conf.USE_SINGLELINE = false;
    const nc = env.NO_COLOR;
    conf.USE_COLORIZE = nc == null || nc === "";
    conf.USE_AUTOCOMPLETE =
      (Object.hasOwn(env, "TSREPL_USE_AUTOCOMPLETE") ? env.TSREPL_USE_AUTOCOMPLETE : "true") !==
      "false";
    conf.COMPLETOR = Object.hasOwn(env, "TSREPL_COMPLETOR") ? env.TSREPL_COMPLETOR : "regexp";
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
    conf.MEASURE_PROC = {};
    (conf.MEASURE_PROC as Record<string, unknown>).TIME = (
      _context: unknown,
      _code: unknown,
      _lineNo: unknown,
      block: () => unknown,
    ) => {
      const time = Date.now();
      const result = block();
      const now = Date.now();
      if (TSREPL.conf.MEASURE) STDOUT.puts(format("processing time: %fs", (now - time) / 1000));
      return result;
    };
    conf.MEASURE_CALLBACKS = [];

    conf.AT_EXIT = [];
  },
};
