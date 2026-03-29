import { describe, it, expect } from "vitest";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ConfigurationFile } from "./configuration-file.js";

describe("ConfigurationFileTest", () => {
  let dir: string;

  function writeYaml(filename: string, content: string): string {
    dir = mkdtempSync(join(tmpdir(), "config-test-"));
    const path = join(dir, filename);
    writeFileSync(path, content);
    return path;
  }

  it("backtrace contains YAML path", () => {
    const path = writeYaml("bad.yml", "a: [invalid\n");
    try {
      expect(() => ConfigurationFile.parse(path)).toThrow(/bad\.yml/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("backtrace contains YAML path (when Pathname given)", () => {
    const path = writeYaml("bad2.yml", "a: [invalid\n");
    try {
      expect(() => ConfigurationFile.parse(path)).toThrow(/bad2\.yml/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("load raw YAML", () => {
    const path = writeYaml("good.yml", "name: test\ncount: 42\n");
    try {
      const result = ConfigurationFile.parse(path);
      expect(result).toEqual({ name: "test", count: 42 });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
