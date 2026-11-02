import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { assertFile } from "./testing/assertions.js";
import { TaskGenerator } from "./rails/task/task-generator.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-task-"));
  fs.writeFileSync(path.join(tmpDir, "tsconfig.json"), "{}");
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("TaskGeneratorTest", () => {
  it("task is created", async () => {
    const gen = new TaskGenerator(["feeds", "foo", "bar"], {}, { destinationRoot: tmpDir });
    await gen.createTaskFiles();
    await assertFile.call({ destinationRoot: tmpDir } as never, "lib/tasks/feeds.ts", (content) => {
      expect(content).toMatch(/namespace: feeds/);
      expect(content).toMatch(/export async function foo\(\)/);
      expect(content).toMatch(/export async function bar\(\)/);
    });
  });
});
