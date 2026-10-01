import { describe, expect, it } from "vitest";
import { capture } from "@blazetrails/activesupport";
import { include, initializeIncludedModules } from "@blazetrails/ruby-compat";
import { Shell } from "./shell.js";
import { Basic } from "./shell/basic.js";

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
});

describe("Thor::Shell::Basic output", () => {
  it("say computes force_new_line from the message only when it is not passed", async () => {
    const shell = new Basic();
    const said = (...args: Parameters<Basic["say"]>) =>
      capture(":stdout", () => shell.say(...args));
    expect(await said("Running...")).toBe("Running...\n");
    expect(await said("Running... ")).toBe("Running... ");
    expect(await said("Running... \n")).toBe("Running... \n");
    expect(await said("Running...", null, undefined)).toBe("Running...");
    expect(await said("Running... ", null, true)).toBe("Running... \n");
  });

  it("say_status indents continuation lines and honours a quiet base", async () => {
    const shell = new Basic();
    const status = (...args: Parameters<Basic["sayStatus"]>) =>
      capture(":stdout", () => shell.sayStatus(...args));
    expect(await status("create", "a\nb\n")).toBe("      create  a\n              b\n");
    expect(await status("create", "a", false)).toBe("");
    shell.base = { options: { quiet: true } };
    expect(await status("create", "a")).toBe("");
  });
});
