import { afterEach, describe, expect, it, vi } from "vitest";
import { capture } from "@blazetrails/activesupport";
import {
  childProcessAdapterConfig,
  include,
  initializeIncludedModules,
  registerChildProcessAdapter,
  setEnv,
  stdin as $stdin,
} from "@blazetrails/ruby-compat";
import { Shell } from "./shell.js";
import { Basic } from "./shell/basic.js";
import { DEFAULT_TERMINAL_WIDTH, terminalWidth } from "./shell/terminal.js";

class Counter {
  options: Record<string, unknown> = {};

  constructor(config: object = {}) {
    initializeIncludedModules(this, [], {}, config);
  }
}
include(Counter, Shell);
const Host = Counter as unknown as new (config?: object) => Counter & Shell;

const tick = () => new Promise((resolve) => setTimeout(resolve, 1));

describe("Thor::Shell block restores wait for an async block to settle", () => {
  it("with_padding, indent and mute hold until the block's promise settles", async () => {
    const shell = new Basic();
    const base = new Host({ shell });
    const out = await capture(":stdout", async () => {
      await base.withPadding(async () => {
        await tick();
        base.say("padded");
      });
      await shell.indent(2, async () => {
        await tick();
        shell.say("deep");
      });
      await shell.mute(async () => {
        await tick();
        shell.say("muted");
      });
      shell.say("loud");
    });
    expect(out).toBe("  padded\n    deep\nloud\n");
    expect(shell.padding).toBe(0);
    expect(shell.isMute()).toBe(false);
  });

  it("indent has no ensure, so a rejected block leaves the padding changed", async () => {
    const shell = new Basic();
    await expect(shell.indent(2, () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    expect(shell.padding).toBe(2);
  });
});

describe("Thor::Shell::Basic#say", () => {
  it("computes force_new_line from the message only when it is not passed", async () => {
    const shell = new Basic();
    expect(await capture(":stdout", () => shell.say("Running..."))).toBe("Running...\n");
    expect(await capture(":stdout", () => shell.say("Running...", null, undefined))).toBe(
      "Running...",
    );
  });
});

describe("Thor::Shell::Terminal", () => {
  it("answers the default width when stty and tput both print nothing", () => {
    registerChildProcessAdapter("thor-terminal-test", {
      spawnSync: () => ({ status: 1, signal: null, stdout: "", stderr: "" }),
    });
    childProcessAdapterConfig.adapter = "thor-terminal-test";
    setEnv("THOR_COLUMNS", undefined);
    expect(terminalWidth()).toBe(DEFAULT_TERMINAL_WIDTH);
  });
});

describe("Thor::Shell::Basic#ask", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const answering = (...lines: Array<string | null>) => {
    const gets = vi.spyOn($stdin, "gets");
    for (const line of lines) gets.mockResolvedValueOnce(line);
    return gets;
  };

  it("joins the statement, the default and a trailing nil, so the prompt ends in a space", async () => {
    const shell = new Basic();
    answering("Ruby\n", "\n");
    let answers: unknown[] = [];
    const out = await capture(":stdout", async () => {
      answers = [
        await shell.ask("Language?"),
        await shell.ask("Language?", { default: "TypeScript" }),
      ];
    });
    expect(out).toBe("Language? Language? (TypeScript) ");
    expect(answers).toEqual(["Ruby", "TypeScript"]);
  });

  it("answers nil at EOF and an empty string for an empty line", async () => {
    const shell = new Basic();
    answering(null, "\n", null);
    await capture(":stdout", async () => {
      expect(await shell.ask("Overwrite?")).toBeNull();
      expect(await shell.ask("Overwrite?")).toBe("");
      expect(await shell.ask("Overwrite?", { default: "y" })).toBeNull();
    });
  });

  it("re-asks a limited_to question until an answer matches", async () => {
    const shell = new Basic();
    const gets = answering("mint\n", "VANILLA\n", "vanilla\n", "VANILLA\n");
    const limitedTo = ["chocolate", "vanilla"];
    const out = await capture(":stdout", async () => {
      expect(await shell.ask("Flavor?", { limitedTo })).toBe("vanilla");
      expect(await shell.ask("Flavor?", ":red", { limitedTo, caseInsensitive: true })).toBe(
        "vanilla",
      );
    });
    expect(gets).toHaveBeenCalledTimes(4);
    const prompt = "Flavor? [chocolate, vanilla] ";
    const retry = "Your response must be one of: [chocolate, vanilla]. Please try again.\n";
    expect(out).toBe(prompt + retry + prompt + retry + prompt + prompt);
  });

  it("yes? and no? match the word or its first letter, and nothing at EOF", async () => {
    const shell = new Basic();
    const base = new Host({ shell });
    answering("Y\n", "yes\n", "yep\n", null, "n\n", "NO\n", "y\n", null);
    await capture(":stdout", async () => {
      expect(await shell.isYes("Sure?")).toBe(true);
      expect(await base.isYes("Sure?")).toBe(true);
      expect(await shell.isYes("Sure?")).toBe(false);
      expect(await shell.isYes("Sure?")).toBe(false);
      expect(await shell.isNo("Sure?")).toBe(true);
      expect(await base.isNo("Sure?")).toBe(true);
      expect(await shell.isNo("Sure?")).toBe(false);
      expect(await shell.isNo("Sure?")).toBe(false);
    });
  });
});
