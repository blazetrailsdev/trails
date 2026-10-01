import { describe, expect, it } from "vitest";
import { capture } from "@blazetrails/activesupport";
import {
  childProcessAdapterConfig,
  include,
  initializeIncludedModules,
  registerChildProcessAdapter,
  setEnv,
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
