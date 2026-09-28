import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  Dir,
  File,
  FileUtils,
  SecureRandom,
  childProcessAdapterConfig,
  registerChildProcessAdapter,
} from "@blazetrails/ruby-compat";
import { assertNoMatch, assertNothingRaised, capture } from "@blazetrails/activesupport";
import { Configuration } from "./configuration.js";
import type { Generators } from "../configuration.js";
import { Generators as RailsGenerators } from "../generators.js";

type ConfiguredGenerators = Generators & Record<string, unknown>;

function withBareConfig(block: (c: Configuration) => void): void {
  block(new Configuration("/app"));
}

function toHash(hash: Map<unknown, unknown>): Record<string, unknown> {
  return Object.fromEntries(hash);
}

describe("GeneratorsTest", () => {
  it("generators default values", () => {
    withBareConfig((c) => {
      expect(c.generators().colorizeLogging).toBe(true);
      expect(toHash(c.generators().aliases)).toEqual({});
      expect(toHash(c.generators().options)).toEqual({});
      expect(c.generators().fallbacks).toEqual({});
    });
  });

  it("generators set rails options", () => {
    withBareConfig((c) => {
      const g = c.generators() as ConfiguredGenerators;
      g.orm = "data_mapper";
      g.testFramework = "rspec";
      g.helper = false;
      const expected = { rails: { orm: "data_mapper", testFramework: "rspec", helper: false } };
      expect(toHash(c.generators().options)).toEqual(expected);
    });
  });

  it("generators set rails aliases", () => {
    withBareConfig((c) => {
      c.generators().aliases = new Map([["rails", { testFramework: "-w" }]]) as never;
      const expected = { rails: { testFramework: "-w" } };
      expect(toHash(c.generators().aliases)).toEqual(expected);
    });
  });

  it("generators with hashes for options and aliases", () => {
    withBareConfig((c) => {
      c.generators((g) => {
        const configured = g as unknown as Record<string, (...args: unknown[]) => void>;
        configured.orm("data_mapper", { migration: false });
        configured.plugin({ aliases: { generator: "-g" }, generator: true });
      });

      const expected = {
        rails: { orm: "data_mapper" },
        plugin: { generator: true },
        data_mapper: { migration: false },
      };

      expect(toHash(c.generators().options)).toEqual(expected);
      expect(toHash(c.generators().aliases)).toEqual({ plugin: { generator: "-g" } });
    });
  });

  it("generators with string and hash for options should generate symbol keys", () => {
    withBareConfig((c) => {
      c.generators((g) => {
        const configured = g as unknown as Record<string, (...args: unknown[]) => void>;
        configured.orm("data_mapper", { migration: false });
      });

      const expected = {
        rails: { orm: "data_mapper" },
        data_mapper: { migration: false },
      };

      expect(toHash(c.generators().options)).toEqual(expected);
    });
  });

  let appRoot: string;
  let previousAdapter: string | null;

  beforeEach(() => {
    appRoot = File.join(Dir.tmpdir(), `trails-generators-${SecureRandom.hex(8)}`);
    FileUtils.mkdirP(appRoot);
    registerChildProcessAdapter("application-generators-test", {
      spawnSync(_cmd, args) {
        const stdout = args.includes("--quiet") ? "" : "3 files inspected, no offenses detected\n";
        return { status: 0, signal: null, stdout, stderr: "" };
      },
    });
    previousAdapter = childProcessAdapterConfig.adapter;
    childProcessAdapterConfig.adapter = "application-generators-test";
  });

  afterEach(() => {
    childProcessAdapterConfig.adapter = previousAdapter;
    RailsGenerators.afterGenerateCallbacks().length = 0;
    FileUtils.rmRf(appRoot);
  });

  function rails(...args: string[]): Promise<string> {
    const [, namespace, ...rest] = args;
    return capture(":stdout", () =>
      RailsGenerators.invoke(namespace, rest, {
        cwd: appRoot,
        output: console.log,
        behavior: "invoke",
      }),
    );
  }

  it("generators with apply_eslint_autocorrect_after_generate!", async () => {
    withBareConfig((c) => {
      c.generators().applyEslintAutocorrectAfterGenerateBang();
      RailsGenerators.configureBang(c.generators());
    });

    const output = await rails("generate", "model", "post", "title:string", "body:string");
    assertNoMatch(/3 files inspected, no offenses detected/, output);
  });

  it("generators with apply_eslint_autocorrect_after_generate! and pretend", async () => {
    withBareConfig((c) => {
      c.generators().applyEslintAutocorrectAfterGenerateBang();
      RailsGenerators.configureBang(c.generators());
    });

    await assertNothingRaised(() =>
      rails("generate", "model", "post", "title:string", "body:string", "--pretend"),
    );
  });
});
