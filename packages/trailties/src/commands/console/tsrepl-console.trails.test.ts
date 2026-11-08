import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TSREPL } from "@blazetrails/ruby-compat";
import { Trails } from "../../trails.js";
import { TSREPLConsole } from "./tsrepl-console.js";

describe("TSREPLConsole#start", () => {
  const app = { name: () => "Blog" };
  let ran: Record<string, unknown> | null;
  let prevEnv: string;

  beforeEach(() => {
    ran = null;
    prevEnv = String(Trails.env);
    vi.spyOn(TSREPL.Tsrepl.prototype, "run").mockImplementation(async (conf) => {
      ran = conf ?? null;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const key of Object.keys(TSREPL.conf)) delete TSREPL.conf[key];
    Trails.env = prevEnv;
  });

  function setupWith(extra: (conf: Record<string, unknown>) => void): void {
    const setup = TSREPL.setup;
    vi.spyOn(TSREPL, "setup").mockImplementation((apPath) => {
      setup(apPath);
      extra(TSREPL.conf);
    });
  }

  it("names the session after the app and swaps only DEFAULT for RAILS_PROMPT", async () => {
    Trails.env = "custom_env";
    setupWith((conf) => {
      conf.PROMPT_MODE = "DEFAULT";
    });
    await new TSREPLConsole(app).start();
    expect(ran).toBe(TSREPL.conf);
    expect(TSREPL.conf.TSREPL_NAME).toBe("Blog");
    expect(TSREPL.conf.PROMPT_MODE).toBe("RAILS_PROMPT");
    setupWith((conf) => {
      conf.PROMPT_MODE = "SIMPLE";
    });
    await new TSREPLConsole(app).start();
    expect(TSREPL.conf.PROMPT_MODE).toBe("SIMPLE");
    expect((TSREPL.conf.PROMPT as Record<string, unknown>).RAILS_PROMPT).toEqual({
      PROMPT_I: "%N(custom_env)> ",
      PROMPT_S: "%N(custom_env)%l ",
      PROMPT_C: "%N(custom_env)* ",
      RETURN: "=> %s\n",
    });
  });

  it("turns autocomplete off outside a local environment only", async () => {
    Trails.env = "production";
    await new TSREPLConsole(app).start();
    expect(TSREPL.conf.USE_AUTOCOMPLETE).toBe(false);
    Trails.env = "development";
    await new TSREPLConsole(app).start();
    expect(TSREPL.conf.USE_AUTOCOMPLETE).toBe(true);
  });

  it("wraps the backtrace cleaner around any existing BACKTRACE_FILTER", async () => {
    vi.spyOn(Trails.backtraceCleaner, "filter").mockImplementation((bt) =>
      bt.map((l) => `clean ${String(l)}`),
    );
    setupWith((conf) => {
      conf.BACKTRACE_FILTER = (bt: string[]) => bt.map((l) => `user ${l}`);
    });
    await new TSREPLConsole(app).start();
    const backtraceFilter = TSREPL.conf.BACKTRACE_FILTER as (bt: string[]) => string[];
    expect(backtraceFilter(["a"])).toEqual(["clean user a"]);
    setupWith((conf) => {
      delete conf.BACKTRACE_FILTER;
    });
    await new TSREPLConsole(app).start();
    expect((TSREPL.conf.BACKTRACE_FILTER as (bt: string[]) => string[])(["a"])).toEqual([
      "clean a",
    ]);
  });
});
