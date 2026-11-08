import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { getProcessAdapter } from "../lib/process-adapter.js";
import { TopLevel } from "../lib/object.js";
import {
  IRB,
  registerReplAdapter,
  replAdapterConfig,
  type ReplServerLike,
} from "../lib/repl-adapter.js";

function fakeRepl() {
  const started: Array<{ prompt: string; server: ReplServerLike & { close(): void } }> = [];
  registerReplAdapter("fake", {
    start({ prompt }) {
      let onExit = () => {};
      const server = {
        context: {} as Record<string, unknown>,
        on(_event: "exit", listener: () => void) {
          onExit = listener;
        },
        close: () => onExit(),
      };
      started.push({ prompt, server });
      queueMicrotask(() => server.close());
      return server;
    },
  });
  replAdapterConfig.adapter = "fake";
  return started;
}

describe("IRB", () => {
  let exit: MockInstance<(code?: number) => never>;

  beforeEach(() => {
    exit = vi.spyOn(getProcessAdapter(), "exit").mockImplementation((() => undefined) as never);
  });

  afterEach(() => {
    for (const key of Object.keys(IRB.conf)) delete IRB.conf[key];
    replAdapterConfig.adapter = "node";
    exit.mockRestore();
  });

  it("setup seeds the default prompts and IRB_NAME", () => {
    IRB.setup(null);
    expect(IRB.conf.IRB_NAME).toBe("irb");
    expect(Object.keys(IRB.conf.PROMPT as object)).toContain("DEFAULT");
    expect(["DEFAULT", "NULL"]).toContain(IRB.conf.PROMPT_MODE);
    expect(IRB.INITIALIZED).toBe(true);
  });

  it("setup raises UndefinedPromptMode for an unknown prompt mode", () => {
    const initConfig = IRB.initConfig;
    IRB.initConfig = (apPath) => {
      initConfig(apPath);
      IRB.conf.PROMPT_MODE = "NOPE";
    };
    try {
      expect(() => IRB.setup(null)).toThrow("Undefined prompt mode(NOPE).");
    } finally {
      IRB.initConfig = initConfig;
    }
  });

  it("format_prompt expands %N, %m, %03n and %l", () => {
    IRB.setup(null);
    IRB.conf.IRB_NAME = "app";
    const irb = new IRB.Irb();
    expect(irb.formatPrompt("%N(%m):%03n%l ", '"', 0, 7)).toBe('app(main):007" ');
  });

  it("helper methods are singletons registered by name", () => {
    class Hello extends IRB.HelperMethod.Base {
      execute(): string {
        return "hi";
      }
    }
    IRB.HelperMethod.register("hello", Hello);
    expect(IRB.HelperMethod.helperMethods.hello).toBe(Hello);
    expect(Hello.instance()).toBe(Hello.instance());
  });

  it("run puts helpers and TopLevel constants on main, runs AT_EXIT, then exits", async () => {
    const started = fakeRepl();
    class Greet extends IRB.HelperMethod.Base {
      execute(): string {
        return "hello";
      }
    }
    IRB.HelperMethod.register("greet", Greet);
    IRB.setup(null);
    IRB.conf.PROMPT_MODE = "DEFAULT";
    const order: string[] = [];
    (IRB.conf.AT_EXIT as Array<() => void>).push(() => order.push("at_exit"));
    exit.mockImplementation((() => order.push("exit")) as never);
    const prev = { name: "outer" };
    IRB.conf.MAIN_CONTEXT = prev;

    await new IRB.Irb().run(IRB.conf);

    const { prompt, server } = started[0];
    expect(prompt).toBe("irb(main):001> ");
    expect((server.context.greet as () => string)()).toBe("hello");
    (TopLevel as Record<string, unknown>).IrbSeatedLater = 42;
    try {
      expect(server.context.IrbSeatedLater).toBe(42);
    } finally {
      delete (TopLevel as Record<string, unknown>).IrbSeatedLater;
    }
    expect(order).toEqual(["at_exit", "exit"]);
    expect(IRB.conf.MAIN_CONTEXT).toBe(prev);
  });
});
