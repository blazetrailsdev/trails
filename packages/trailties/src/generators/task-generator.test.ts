import { Dir, File } from "@blazetrails/ruby-compat";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { beforeEach, describe, expect, it } from "vitest";
import { TaskGenerator } from "./rails/task/task-generator.js";
import { TestCase } from "./test-case.js";

class TaskGeneratorTest extends TestCase {}
TaskGeneratorTest.destination(Dir.mktmpdir());
TaskGeneratorTest.tests(TaskGenerator);
TaskGeneratorTest.arguments(["feeds", "foo", "bar"]);
registerSpecType(/^TaskGeneratorTest$/, TaskGeneratorTest);
let t: TestCase;

beforeEach((context) => {
  t = context.testCase as TestCase;
  t.prepareDestination();
  File.write(File.join(t.destinationRoot, "tsconfig.json"), "{}");
});

describe("TaskGeneratorTest", () => {
  it("task is created", async () => {
    await t.runGenerator();
    await t.assertFile("lib/tasks/feeds.ts", (content) => {
      expect(content).toMatch(/namespace: feeds/);
      expect(content).toMatch(/export async function foo\(\)/);
      expect(content).toMatch(/export async function bar\(\)/);
    });
  });

  it("task on revoke", async () => {
    const taskPath = "lib/tasks/feeds.ts";
    await t.runGenerator();
    await t.assertFile(taskPath);
    await t.runGenerator(["feeds"], { behavior: "revoke" });
    t.assertNoFile(taskPath);
  });
});
