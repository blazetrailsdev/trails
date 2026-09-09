import { describe, it, expect } from "vitest";
import { File as RubyFile, Tempfile } from "@blazetrails/ruby-compat";

import { File } from "./file.js";
import { FixtureSet, FormatError } from "../fixtures.js";

const FIXTURES_ROOT = new URL("./test-data", import.meta.url).pathname;

function tmpYaml<T>(name: [string, string], contents: string, block: (t: Tempfile) => T): T {
  const t = Tempfile.new(name);
  t.binmode();
  t.write(contents);
  t.close();
  try {
    return block(t);
  } finally {
    t.close(true);
  }
}

describe("FixtureSet", () => {
  describe("FileTest", () => {
    it("open", () => {
      const fh = File.open(RubyFile.join(FIXTURES_ROOT, "accounts.yml"));
      expect(fh.each().length).toBe(6);
    });

    it("open with block", () => {
      let called = false;
      File.open(RubyFile.join(FIXTURES_ROOT, "accounts.yml"), (fh) => {
        called = true;
        expect(fh.each().length).toBe(6);
      });
      expect(called).toBe(true);
    });

    it("names", () => {
      File.open(RubyFile.join(FIXTURES_ROOT, "accounts.yml"), (fh) => {
        expect(
          [
            "signals37",
            "unknown",
            "rails_core_account",
            "last_account",
            "rails_core_account_2",
            "odegy_account",
          ].sort(),
        ).toEqual(
          fh
            .each()
            .map(([name]) => name)
            .sort(),
        );
      });
    });

    it("values", () => {
      File.open(RubyFile.join(FIXTURES_ROOT, "accounts.yml"), (fh) => {
        expect([1, 2, 3, 4, 5, 6]).toEqual(
          fh
            .each()
            .map(([, row]) => (row as Record<string, unknown>)["id"])
            .sort(),
        );
      });
    });

    it("tse processing", () => {
      File.open(RubyFile.join(FIXTURES_ROOT, "developers.yml"), (fh) => {
        const devs = Array.from({ length: 8 }, (_, i) => `dev_${i + 3}`);
        const names = fh.each().map(([name]) => name);
        expect([]).toEqual(devs.filter((dev) => !names.includes(dev)));
      });
    });

    it("empty file", () => {
      tmpYaml(["empty", "yml"], "", (t) => {
        expect([]).toEqual(File.open(t.path!, (fh) => fh.each()));
      });
    });

    it("wrong fixture format string", () => {
      tmpYaml(["empty", "yml"], "qwerty", (t) => {
        expect(() => File.open(t.path!, (fh) => fh.each())).toThrow(FormatError);
      });
    });

    it("wrong fixture format nested", () => {
      tmpYaml(["empty", "yml"], "one: two", (t) => {
        expect(() => File.open(t.path!, (fh) => fh.each())).toThrow(FormatError);
      });
    });

    it("wrong config row", () => {
      tmpYaml(["empty", "yml"], "---\n_fixture:\n  class_name: Foo\n", (t) => {
        let error: unknown;
        expect(() => {
          try {
            File.open(t.path!, (fh) => fh.modelClass);
          } catch (raised) {
            error = raised;
            throw raised;
          }
        }).toThrow(FormatError);
        expect((error as Error).message).toContain("Invalid `_fixture` section");
      });
    });

    it("render context helper", () => {
      (FixtureSet.contextClass.prototype as Record<string, unknown>)["fixtureHelper"] =
        function fixtureHelper(): string {
          return "Fixture helper";
        };
      const yaml = "one:\n  name: <%= fixtureHelper() %>\n";
      tmpYaml(["curious", "yml"], yaml, (t) => {
        const golden = [["one", { name: "Fixture helper" }]];
        expect(golden).toEqual(File.open(t.path!, (fh) => fh.each()));
      });
      delete (FixtureSet.contextClass.prototype as Record<string, unknown>)["fixtureHelper"];
    });

    it("independent render contexts", () => {
      const yaml1 = "<% function leakedMethod() { return 'leak'; } %>\n";
      const yaml2 = "one:\n  name: <%= leakedMethod() %>\n";
      tmpYaml(["leaky", "yml"], yaml1, (t1) => {
        tmpYaml(["curious", "yml"], yaml2, (t2) => {
          File.open(t1.path!, (fh) => fh.each());
          expect(() => File.open(t2.path!, (fh) => fh.each())).toThrow(ReferenceError);
        });
      });
    });

    it("removes fixture config row", () => {
      File.open(RubyFile.join(FIXTURES_ROOT, "other_posts.yml"), (fh) => {
        expect(["second_welcome"]).toEqual(fh.each().map(([name]) => name));
      });
    });

    it("extracts model class from config row", () => {
      File.open(RubyFile.join(FIXTURES_ROOT, "other_posts.yml"), (fh) => {
        expect("Post").toEqual(fh.modelClass);
      });
    });
  });
});
