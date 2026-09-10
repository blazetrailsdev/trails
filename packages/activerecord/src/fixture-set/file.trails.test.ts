import { describe, it, expect } from "vitest";
import { File as RubyFile, Tempfile } from "@blazetrails/ruby-compat";

import { File } from "./file.js";
import { RenderContext } from "./render-context.js";
import { FixtureSet } from "../fixtures.js";

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

describe("FixtureSet::File ordered maps (trails)", () => {
  it("accepts a !!omap document and keeps its entry order", () => {
    const yaml = "--- !!omap\n- two:\n    name: b\n- one:\n    name: a\n";
    tmpYaml(["omap", "yml"], yaml, (t) => {
      expect(File.open(t.path!, (fh) => [...fh.each()])).toEqual([
        ["two", { name: "b" }],
        ["one", { name: "a" }],
      ]);
    });
  });

  it("still rejects a !!omap whose row is not a hash", () => {
    tmpYaml(["omap", "yml"], "--- !!omap\n- one: two\n", (t) => {
      expect(() => File.open(t.path!, (fh) => [...fh.each()])).toThrow(/fixture key is not a hash/);
    });
  });
});

describe("FixtureSet::File#each (trails)", () => {
  it("answers a fresh iterator that does not expose the backing rows", () => {
    const path = RubyFile.join(new URL(".", import.meta.url).pathname, "test-data/accounts.yml");
    const fh = File.open(path);
    expect([...fh.each()]).toHaveLength(6);
    expect([...fh.each()]).toHaveLength(6);
    expect(Array.isArray(fh.each())).toBe(false);
  });
});

describe("FixtureSet::RenderContext#binary (trails)", () => {
  it("renders a file's bytes as a strict-base64 !!binary scalar", () => {
    const blob = Tempfile.new(["blob", "bin"]);
    blob.close();
    RubyFile.binwrite(blob.path!, "Hello");
    try {
      expect(new (RenderContext.createSubclass())().binary(blob.path!)).toBe('!!binary "SGVsbG8="');
    } finally {
      blob.close(true);
    }
  });
});

describe("FixtureSet.contextClass (trails)", () => {
  it("memoizes per receiver, so a subclass gets its own context class", () => {
    class SubSet extends FixtureSet {}

    expect(FixtureSet.contextClass).toBe(FixtureSet.contextClass);
    expect(SubSet.contextClass).toBe(SubSet.contextClass);
    expect(SubSet.contextClass).not.toBe(FixtureSet.contextClass);
  });
});
