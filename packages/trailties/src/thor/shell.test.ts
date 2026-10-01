import { beforeEach, describe, expect, it } from "vitest";
import { capture } from "@blazetrails/activesupport";
import { include, initializeIncludedModules, setEnv } from "@blazetrails/ruby-compat";
import { Base, Shell } from "./shell.js";
import { Basic } from "./shell/basic.js";

Base.shell = Shell.Basic;

class Counter {
  options: Record<string, unknown>;

  constructor(args: unknown[] = [], options: Record<string, unknown> = {}, config: object = {}) {
    this.options = options;
    initializeIncludedModules(this, args, options, config);
  }
}
include(Counter, Shell);
const MyCounter = Counter as unknown as new (
  ...args: ConstructorParameters<typeof Counter>
) => Counter & Shell;

describe("Thor::Shell", () => {
  let _shell: Basic | undefined;
  const shell = () => (_shell ??= new Base.shell());
  beforeEach(() => {
    _shell = undefined;
  });

  describe("#initialize", () => {
    it("sets shell value", () => {
      const base = new MyCounter([1, 2], {}, { shell: shell() });
      expect(base.shell).toEqual(shell());
    });

    it("sets the base value on the shell if an accessor is available", () => {
      const base = new MyCounter([1, 2], {}, { shell: shell() });
      expect(shell().base).toEqual(base);
    });
  });

  describe("#shell", () => {
    it("returns the shell in use", () => {
      expect(new MyCounter([1, 2]).shell).toBeInstanceOf(Base.shell);
    });

    it("uses $THOR_SHELL", () => {
      class TestShell extends Basic {}
      (Shell as unknown as Record<string, unknown>).TestShell = TestShell;

      expect(Base.shell).toEqual(shell().constructor);
      setEnv("THOR_SHELL", "TestShell");
      Base.shell = null;
      expect(Base.shell).toEqual(TestShell);
      setEnv("THOR_SHELL", "");
      Base.shell = shell().constructor as typeof Basic;
      expect(Base.shell).toEqual(shell().constructor);
    });
  });

  describe("with_padding", () => {
    it("uses padding for inside block outputs", async () => {
      const base = new MyCounter([1, 2]);
      await base.withPadding(async () => {
        expect((await capture(":stdout", () => base.sayStatus("padding", "cool"))).trim()).toEqual(
          "padding    cool",
        );
      });
    });
  });
});
