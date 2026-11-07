import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  Dir,
  File,
  FileUtils,
  SecureRandom,
  childProcessAdapterConfig,
  registerChildProcessAdapter,
  stdout,
} from "@blazetrails/ruby-compat";
import { assertNoMatch, assertNothingRaised, capture } from "@blazetrails/activesupport";
import { Configuration } from "./configuration.js";
import type { Generators } from "../configuration.js";
import { Generators as TrailsGenerators } from "../generators.js";
import { Base as ThorBase } from "@blazetrails/thor/shell";
import { Basic } from "@blazetrails/thor/shell/basic";

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

  it("generators set trails options", () => {
    withBareConfig((c) => {
      const g = c.generators() as ConfiguredGenerators;
      g.orm = "data_mapper";
      g.testFramework = "rspec";
      g.helper = false;
      const expected = { trails: { orm: "data_mapper", testFramework: "rspec", helper: false } };
      expect(toHash(c.generators().options)).toEqual(expected);
    });
  });

  it("generators set trails aliases", () => {
    withBareConfig((c) => {
      c.generators().aliases = new Map([["trails", { testFramework: "-w" }]]) as never;
      const expected = { trails: { testFramework: "-w" } };
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
        trails: { orm: "data_mapper" },
        plugin: { generator: true },
        data_mapper: { migration: false },
      };

      expect(toHash(c.generators().options)).toEqual(expected);
      expect(toHash(c.generators().aliases)).toEqual({ plugin: { generator: "-g" } });
    });
  });

  it("generators no color on initialization", () => {
    const shell = ThorBase.shell;
    try {
      withBareConfig((c) => {
        c.generators().colorizeLogging = false;
        TrailsGenerators.configureBang(c.generators());
      });

      expect(ThorBase.shell).toBe(Basic);
    } finally {
      ThorBase.shell = shell;
    }
  });

  it("api only generators hide assets, helper, js and css namespaces and set api option", () => {
    const hidden = [...TrailsGenerators.hiddenNamespaces()];
    const options = { ...TrailsGenerators.options().trails };
    try {
      withBareConfig((c) => {
        c.apiOnly = true;
        TrailsGenerators.configureBang(c.generators());
      });

      expect(TrailsGenerators.hiddenNamespaces()).toContain("assets");
      expect(TrailsGenerators.hiddenNamespaces()).toContain("helper");
      expect(TrailsGenerators.hiddenNamespaces()).toContain("js");
      expect(TrailsGenerators.hiddenNamespaces()).toContain("css");
      expect(TrailsGenerators.options().trails.api).toBeTruthy();
      expect(TrailsGenerators.options().trails.assets).toBe(false);
      expect(TrailsGenerators.options().trails.helper).toBe(false);
      expect(TrailsGenerators.options().trails.templateEngine).toBeNull();
    } finally {
      TrailsGenerators.hiddenNamespaces().splice(0, Infinity, ...hidden);
      Object.assign(TrailsGenerators.options().trails, options);
    }
  });

  it("generators with string and hash for options should generate symbol keys", () => {
    withBareConfig((c) => {
      c.generators((g) => {
        const configured = g as unknown as Record<string, (...args: unknown[]) => void>;
        configured.orm("data_mapper", { migration: false });
      });

      const expected = {
        trails: { orm: "data_mapper" },
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
      spawnSync() {
        return { status: 0, signal: null, stdout: "", stderr: "" };
      },
      async system(_cmd, _env, args) {
        if (!args?.includes("--quiet")) stdout.write("3 files inspected, no offenses detected\n");
        return { pid: 1, status: 0, signal: null };
      },
    });
    previousAdapter = childProcessAdapterConfig.adapter;
    childProcessAdapterConfig.adapter = "application-generators-test";
  });

  afterEach(() => {
    childProcessAdapterConfig.adapter = previousAdapter;
    TrailsGenerators.afterGenerateCallbacks().length = 0;
    FileUtils.rmRf(appRoot);
  });

  function trails(...args: string[]): Promise<string> {
    const [, namespace, ...rest] = args;
    return capture(":stdout", () =>
      TrailsGenerators.invoke(namespace, rest, {
        destinationRoot: appRoot,
        behavior: "invoke",
      }),
    );
  }

  it("generators with apply_eslint_autocorrect_after_generate!", async () => {
    withBareConfig((c) => {
      c.generators().applyEslintAutocorrectAfterGenerateBang();
      TrailsGenerators.configureBang(c.generators());
    });

    const output = await trails("generate", "model", "post", "title:string", "body:string");
    assertNoMatch(/3 files inspected, no offenses detected/, output);
  });

  it("generators with apply_eslint_autocorrect_after_generate! and pretend", async () => {
    withBareConfig((c) => {
      c.generators().applyEslintAutocorrectAfterGenerateBang();
      TrailsGenerators.configureBang(c.generators());
    });

    await assertNothingRaised(() =>
      trails("generate", "model", "post", "title:string", "body:string", "--pretend"),
    );
  });
});
