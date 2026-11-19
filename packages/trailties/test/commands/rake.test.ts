import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { Isolation } from "@blazetrails/activesupport/testing/isolation";
import { include } from "@blazetrails/ruby-compat";
import type { Generation } from "../support/isolation/abstract-unit.js";
import "../support/isolation/abstract-unit.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type
interface RakeTest extends Generation {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class RakeTest extends TestCase {}
include(RakeTest, Isolation);

describe("Trails::Command::RakeTest", { timeout: 120_000 }, () => {
  let t: RakeTest;

  beforeEach(async () => {
    t = new RakeTest("test");
    await t.buildApp();
  });

  afterEach(() => t.teardownApp());

  const runRakeCommand = (...args: string[]) => t.trails(args);

  it("runs multiple tasks", async () => {
    await t.appFile(
      "lib/tasks/foo.rake.ts",
      'import { DSL } from "@blazetrails/rake";\nimport { block } from "@blazetrails/ruby-compat";\nDSL.task("foo", block(() => console.log("FOO!")));\n',
    );
    await t.appFile(
      "lib/tasks/bar.rake.ts",
      'import { DSL } from "@blazetrails/rake";\nimport { block } from "@blazetrails/ruby-compat";\nDSL.task("bar", block(() => console.log("BAR!")));\n',
    );

    const output = await runRakeCommand("foo", "bar");
    expect(output).toMatch("FOO!");
    expect(output).toMatch("BAR!");
  });

  it("runs task with arguments", async () => {
    await t.appFile(
      "lib/tasks/hello.rake.ts",
      `import { DSL, type Task, type TaskArguments } from "@blazetrails/rake";
import { block } from "@blazetrails/ruby-compat";

DSL.namespace("greetings", () => {
  DSL.task(
    "hello",
    "name",
    block((_task: Task, args: TaskArguments) => {
      console.log(\`Hello, \${args.get("name")}!\`);
    }),
  );
});
`,
    );

    expect(await runRakeCommand("greetings:hello[World]")).toMatch("Hello, World!");
  });
});
