import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IRB } from "@blazetrails/ruby-compat";
import { Trails } from "../../trails.js";
import { IRBConsole } from "./irb-console.js";

describe("IRBConsole#start", () => {
  const app = { name: () => "Blog" };
  let ran: Record<string, unknown> | null;
  let prevEnv: string;

  beforeEach(() => {
    ran = null;
    prevEnv = String(Trails.env);
    vi.spyOn(IRB.Irb.prototype, "run").mockImplementation(async (conf) => {
      ran = conf ?? null;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const key of Object.keys(IRB.conf)) delete IRB.conf[key];
    Trails.env = prevEnv;
  });

  function setupWith(extra: (conf: Record<string, unknown>) => void): void {
    const setup = IRB.setup;
    vi.spyOn(IRB, "setup").mockImplementation((apPath) => {
      setup(apPath);
      extra(IRB.conf);
    });
  }

  it("names the session after the app and swaps DEFAULT for RAILS_PROMPT", async () => {
    Trails.env = "custom_env";
    setupWith((conf) => {
      conf.PROMPT_MODE = "DEFAULT";
    });
    await new IRBConsole(app).start();
    expect(ran).toBe(IRB.conf);
    expect(IRB.conf.IRB_NAME).toBe("Blog");
    expect(IRB.conf.PROMPT_MODE).toBe("RAILS_PROMPT");
    expect((IRB.conf.PROMPT as Record<string, unknown>).RAILS_PROMPT).toEqual({
      PROMPT_I: "%N(custom_env)> ",
      PROMPT_S: "%N(custom_env)%l ",
      PROMPT_C: "%N(custom_env)* ",
      RETURN: "=> %s\n",
    });
  });

  it("respects a prompt mode other than DEFAULT", async () => {
    setupWith((conf) => {
      conf.PROMPT_MODE = "SIMPLE";
    });
    await new IRBConsole(app).start();
    expect(IRB.conf.PROMPT_MODE).toBe("SIMPLE");
  });

  it("turns autocomplete off outside a local environment", async () => {
    Trails.env = "production";
    await new IRBConsole(app).start();
    expect(IRB.conf.USE_AUTOCOMPLETE).toBe(false);
  });

  it("keeps autocomplete in a local environment", async () => {
    Trails.env = "development";
    await new IRBConsole(app).start();
    expect(IRB.conf.USE_AUTOCOMPLETE).toBe(true);
  });

  it("filters the backtrace through the backtrace cleaner", async () => {
    const filter = vi
      .spyOn(Trails.backtraceCleaner, "filter")
      .mockImplementation((bt) => bt.map((l) => `clean ${String(l)}`));
    await new IRBConsole(app).start();
    const backtraceFilter = IRB.conf.BACKTRACE_FILTER as (bt: string[]) => string[];
    expect(backtraceFilter(["a"])).toEqual(["clean a"]);
    expect(filter).toHaveBeenCalledWith(["a"]);
  });

  it("runs an existing BACKTRACE_FILTER before the backtrace cleaner", async () => {
    vi.spyOn(Trails.backtraceCleaner, "filter").mockImplementation((bt) =>
      bt.map((l) => `clean ${String(l)}`),
    );
    setupWith((conf) => {
      conf.BACKTRACE_FILTER = (bt: string[]) => bt.map((l) => `user ${l}`);
    });
    await new IRBConsole(app).start();
    const backtraceFilter = IRB.conf.BACKTRACE_FILTER as (bt: string[]) => string[];
    expect(backtraceFilter(["a"])).toEqual(["clean user a"]);
  });
});
