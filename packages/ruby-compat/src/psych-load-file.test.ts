import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { YAML } from "./yaml.js";
import { File } from "./file.js";

describe("YAML.load_file", () => {
  let dir: string;
  let testFile: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "trails-yaml-"));
    testFile = join(dir, "yaml_test_file");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns a hash", () => {
    File.open(testFile, "w", (io) => {
      YAML.dump({ bar: 2, car: 1 }, io);
    });
    expect(Object.fromEntries(YAML.loadFile(testFile) as Map<string, unknown>)).toEqual({
      bar: 2,
      car: 1,
    });
  });
});
