import { describe, expect, it } from "vitest";
import { useApplicationTestCase } from "./support/application.js";
import { rakefile } from "./support/rakefile-definitions.js";
import { rake, runner, useRubyRunner } from "./support/ruby-runner.js";

describe("TestRakeReduceCompat", () => {
  useApplicationTestCase();
  useRubyRunner();

  async function invokeNormal(taskName: string): Promise<string> {
    await rake(taskName);
    return runner.out;
  }

  it("no deprecated dsl", async () => {
    await rakefile(`
      task("check_task", block(() => {
        console.log("task" in {} ? "method" : "nil");
      }));

      task("check_file", block(() => {
        console.log("file" in {} ? "method" : "nil");
      }));
    `);

    expect((await invokeNormal("check_task")).trimEnd()).toEqual("nil");
    expect((await invokeNormal("check_file")).trimEnd()).toEqual("nil");
  });
});
