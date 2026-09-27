import { describe, expect, it } from "vitest";
import { Configuration } from "./configuration.js";
import type { Generators } from "../configuration.js";

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
});
