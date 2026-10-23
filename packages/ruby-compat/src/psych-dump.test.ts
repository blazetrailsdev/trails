import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { YAML, toYaml } from "./yaml.js";
import { File } from "./file.js";

function cleanYaml(yaml: string): string {
  return yaml.replace(/([^-]|^---)[ \t]+\n/gm, "$1\n").replace(/\n\.\.\.\n$/, "\n");
}

describe("YAML.dump", () => {
  let dir: string;
  let testFile: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "trails-yaml-"));
    testFile = join(dir, "yaml_test_file");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("converts an object to YAML and write result to io when io provided", () => {
    File.open(testFile, "w", (io) => {
      YAML.dump(["badger", "elephant", "tiger"], io);
    });
    expect(YAML.loadFile(testFile)).toEqual(["badger", "elephant", "tiger"]);
  });

  it("returns a string containing dumped YAML when no io provided", () => {
    expect(cleanYaml(YAML.dump(":locked"))).toBe(cleanYaml("--- :locked\n"));
  });

  it("returns the same string that #to_yaml on objects", () => {
    expect(toYaml(["a", "b", "c"])).toBe(YAML.dump(["a", "b", "c"]));
  });

  it("dumps strings into YAML strings", () => {
    expect(cleanYaml(YAML.dump("str"))).toBe(cleanYaml("--- str\n"));
  });

  it("dumps hashes into YAML key-values", () => {
    expect(cleanYaml(YAML.dump({ a: "b" }))).toBe(cleanYaml("--- \na: b\n"));
  });

  it("dumps Arrays into YAML collection", () => {
    expect(cleanYaml(YAML.dump(["a", "b", "c"]))).toBe(cleanYaml("--- \n- a\n- b\n- c\n"));
  });

  // PERMANENT-SKIP: ruby-compat does not port OpenStruct.
  it.skip("dumps an OpenStruct");

  // PERMANENT-SKIP: a ruby-compat File holds a Node file descriptor, which Psych dumps as state.
  it.skip("dumps a File without any state");
});
