import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { getProcessAdapter } from "../lib/process-adapter.js";
import { TopLevel } from "../lib/object.js";
import { Kernel } from "../lib/include.js";
import { autoloadDelete, rbAutoloadLoad, rbAutoloadStr } from "../lib/variable.js";
import { LoadError } from "../lib/load-error.js";
import {
  TSREPL,
  registerReplAdapter,
  replAdapterConfig,
  type ReplServerLike,
} from "../lib/repl-adapter.js";

function fakeRepl() {
  const started: Array<{
    prompt: string;
    server: ReplServerLike & { close(): void; evaluated: string[] };
  }> = [];
  registerReplAdapter("fake", {
    start({ prompt }) {
      let onExit = () => {};
      const server = {
        context: {} as Record<string, unknown>,
        on(_event: "exit", listener: () => void) {
          onExit = listener;
        },
        close: () => onExit(),
        evaluated: [] as string[],
        eval(cmd: string, _ctx: object, _file: string, cb: (e: Error | null, r?: unknown) => void) {
          server.evaluated.push(cmd);
          cb(null, (TopLevel as Record<string, unknown>).IrbLazy);
        },
      };
      started.push({ prompt, server });
      queueMicrotask(() => server.close());
      return server;
    },
  });
  replAdapterConfig.adapter = "fake";
  return started;
}

describe("TSREPL", () => {
  let exit: MockInstance<(code?: number) => never>;

  beforeEach(() => {
    exit = vi.spyOn(getProcessAdapter(), "exit").mockImplementation((() => undefined) as never);
  });

  afterEach(() => {
    for (const key of Object.keys(TSREPL.conf)) delete TSREPL.conf[key];
    replAdapterConfig.adapter = "node";
    exit.mockRestore();
  });

  it("setup seeds the default prompts and TSREPL_NAME, which format_prompt expands", () => {
    TSREPL.setup(null);
    expect(TSREPL.conf.TSREPL_NAME).toBe("tsrepl");
    expect(Object.keys(TSREPL.conf.PROMPT as object)).toContain("DEFAULT");
    expect(["DEFAULT", "NULL"]).toContain(TSREPL.conf.PROMPT_MODE);
    expect(TSREPL.INITIALIZED).toBe(true);
    TSREPL.conf.TSREPL_NAME = "app";
    expect(new TSREPL.Tsrepl().formatPrompt("%N(%m):%03n%l ", '"', 0, 7)).toBe('app(main):007" ');
  });

  it("setup raises UndefinedPromptMode for an unknown prompt mode", () => {
    const initConfig = TSREPL.initConfig;
    TSREPL.initConfig = (apPath) => {
      initConfig(apPath);
      TSREPL.conf.PROMPT_MODE = "NOPE";
    };
    try {
      expect(() => TSREPL.setup(null)).toThrow("Undefined prompt mode(NOPE).");
    } finally {
      TSREPL.initConfig = initConfig;
    }
  });

  it("run puts helpers and TopLevel constants on main, runs AT_EXIT, then exits", async () => {
    const started = fakeRepl();
    class Greet extends TSREPL.HelperMethod.Base {
      execute(): string {
        return "hello";
      }
    }
    TSREPL.HelperMethod.register("greet", Greet);
    TSREPL.setup(null);
    TSREPL.conf.PROMPT_MODE = "DEFAULT";
    const order: string[] = [];
    (TSREPL.conf.AT_EXIT as Array<() => void>).push(() => order.push("at_exit"));
    exit.mockImplementation((() => order.push("exit")) as never);
    const prev = { name: "outer" };
    TSREPL.conf.MAIN_CONTEXT = prev;

    await new TSREPL.Tsrepl().run(TSREPL.conf);

    const { prompt, server } = started[0];
    expect(prompt).toBe("tsrepl(main):001> ");
    expect((server.context.greet as () => string)()).toBe("hello");
    expect(Greet.instance()).toBe(Greet.instance());
    const singleton = Object.getPrototypeOf(server.context) as object;
    expect(singleton).not.toBe(Object.prototype);
    expect(String(server.context)).toBe("[object Object]");
    expect(typeof (server.context as object).hasOwnProperty).toBe("function");
    (TopLevel as Record<string, unknown>).IrbSeatedLater = 42;
    try {
      expect(server.context.IrbSeatedLater).toBe(42);
    } finally {
      delete (TopLevel as Record<string, unknown>).IrbSeatedLater;
    }
    expect(order).toEqual(["at_exit", "exit"]);
    expect(TSREPL.conf.MAIN_CONTEXT).toBe(prev);
  });

  it("evaluate loads a pending top-level autoload before the REPL evaluates", async () => {
    const started = fakeRepl();
    TSREPL.setup(null);
    const required: string[] = [];
    const prevRequire = Kernel.require;
    Kernel.require = async (feature) => {
      required.push(feature);
      autoloadDelete(Object, "IrbLazy");
      (TopLevel as Record<string, unknown>).IrbLazy = 7;
      return true;
    };
    rbAutoloadStr(Object, "IrbLazy", "/app/models/irb_lazy.ts");
    rbAutoloadStr(Object, "IrbOther", "/app/models/irb_other.ts");
    try {
      await new TSREPL.Tsrepl().run(TSREPL.conf);
      const { server } = started[0];
      const result = await new Promise((resolve, reject) =>
        server.eval("IrbLazy + 1", server.context, "repl", (e, r) => (e ? reject(e) : resolve(r))),
      );
      await new Promise((resolve) => server.eval("x.IrbOther", server.context, "repl", resolve));
      expect(required).toEqual(["/app/models/irb_lazy.ts"]);
      expect(server.evaluated).toEqual(["IrbLazy + 1", "x.IrbOther"]);
      expect(result).toBe(7);
    } finally {
      Kernel.require = prevRequire;
      autoloadDelete(Object, "IrbLazy");
      autoloadDelete(Object, "IrbOther");
      delete (TopLevel as Record<string, unknown>).IrbLazy;
    }
  });

  it("a pending autoload with no gem's require raises LoadError", async () => {
    rbAutoloadStr(Object, "IrbMissing", "/nowhere/irb_missing");
    try {
      await expect(rbAutoloadLoad(Object, "IrbMissing")).rejects.toBeInstanceOf(LoadError);
    } finally {
      autoloadDelete(Object, "IrbMissing");
    }
  });
});
