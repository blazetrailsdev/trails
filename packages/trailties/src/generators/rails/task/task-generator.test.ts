import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { TaskGenerator } from "./task-generator.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-task-"));
  fs.writeFileSync(path.join(tmpDir, "tsconfig.json"), "{}");
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("TaskGeneratorTest", () => {
  it("task is created", () => {
    const gen = new TaskGenerator({
      cwd: tmpDir,
      output: () => {},
      name: "feeds",
    });
    const files = gen.run({ actions: ["foo", "bar"] });
    const taskPath = "lib/tasks/feeds.ts";
    expect(files).toContain(taskPath);
    const content = fs.readFileSync(path.join(tmpDir, taskPath), "utf-8");
    expect(content).toMatch(/namespace: feeds/);
    expect(content).toMatch(/export async function foo\(\)/);
    expect(content).toMatch(/export async function bar\(\)/);
  });
});
