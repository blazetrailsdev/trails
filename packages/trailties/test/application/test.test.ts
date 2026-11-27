import { describe, expect, test } from "vitest";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { Isolation } from "@blazetrails/activesupport/testing/isolation";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { include } from "@blazetrails/ruby-compat/include";
import { File } from "@blazetrails/ruby-compat/file";
import { Process } from "@blazetrails/ruby-compat/process";
import { env as ENV, setEnv } from "@blazetrails/ruby-compat/process-adapter";
import type { Generation } from "../support/isolation/abstract-unit.js";
import "../support/isolation/abstract-unit.js";

type Host = Generation & TestTest;

class TestTest extends TestCase {
  async assertUnsuccessfulRun(this: Host, name: string, message: string): Promise<string> {
    const result = await this.runTestFile(name);
    expect(Process.lastStatus!.exitstatus()).not.toBe(0);
    expect(result).toContain(message);
    return result;
  }

  async assertSuccessfulTestRun(this: Host, name: string): Promise<string> {
    const result = await this.runTestFile(name);
    expect(Process.lastStatus!.exitstatus(), result).toBe(0);
    return result;
  }

  async runTestFile(this: Host, name: string): Promise<string> {
    return this.trails("test", `${await this.appPath()}/test/${name}`, { allowFailure: true });
  }
}
include(TestTest, Isolation);
registerSpecType(/^TestTest$/, TestTest);

function it(name: string, block: (t: Host) => Promise<void>): void {
  test(name, async () => {
    const old = ENV["PARALLEL_WORKERS"];
    setEnv("PARALLEL_WORKERS", "0");
    const t = new TestTest(name) as Host;
    await t.buildApp();
    try {
      await block(t);
    } finally {
      setEnv("PARALLEL_WORKERS", old);
      await t.teardownApp();
    }
  });
}

describe("TestTest", { timeout: 600_000 }, () => {
  it("simple successful test", async (t) => {
    await t.appFile(
      "test/unit/foo.test.ts",
      `
        import "../test-helper.ts";
        import { describe, it, expect } from "vitest";

        describe("FooTest", () => {
          it("truth", () => {
            expect(true).toBe(true);
          });
        });
`,
    );

    await t.assertSuccessfulTestRun("unit/foo.test.ts");
  });

  it("simple failed test", async (t) => {
    await t.appFile(
      "test/unit/foo.test.ts",
      `
        import "../test-helper.ts";
        import { describe, it, expect } from "vitest";

        describe("FooTest", () => {
          it("truth", () => {
            expect(false).toBe(true);
          });
        });
`,
    );

    await t.assertUnsuccessfulRun("unit/foo.test.ts", "Failure:\nFooTest#truth");
  });

  it("enable full backtraces on test failures", async (t) => {
    await t.appFile(
      "test/unit/failing.test.ts",
      `import "../test-helper.ts";
import { describe, it } from "vitest";
describe("FailingTest", () => {
  it("failure", () => {
    throw new Error("fail");
  });
});
`,
    );

    const output = await t.runTestFile("unit/failing.test.ts");
    expect(output).toMatch(/test\/unit\/failing\.test\.ts/);
    expect(output).toMatch(/test\/unit\/failing\.test\.ts:4/);
  });

  it("ruby schema migrations", async (t) => {
    const output = await t.trails("generate", "model", "user", "name:string");
    const version = output.match(/(\d+)_create_users\.ts/)![1];

    await t.appFile(
      "test/models/user.test.ts",
      `import "../test-helper.ts";
import { describe, it } from "vitest";
import { User } from "../../app/models/user.ts";

describe("UserTest", () => {
  it("user", async () => {
    await User.createBang({ name: "Jon" });
  });
});
`,
    );
    await t.appFile("db/schema.ts", "");

    await t.assertUnsuccessfulRun("models/user.test.ts", "Migrations are pending");

    await t.appFile(
      "db/schema.ts",
      `import { Schema } from "@blazetrails/activerecord";

await Schema.define({ version: ${version} }, async (ctx) => {
  await ctx.createTable("users", (t) => {
    t.string("name");
  });
});
`,
    );

    await t.appFile(
      "config/initializers/disable-maintain-test-schema.ts",
      `import { Trails } from "@blazetrails/trailties";

Trails.application.config.activeRecord.maintainTestSchema = false;
`,
    );

    await t.assertUnsuccessfulRun("models/user.test.ts", "Could not find table 'users'");

    await File.deleteAsync(
      `${await t.appPath()}/config/initializers/disable-maintain-test-schema.ts`,
    );

    const result = await t.assertSuccessfulTestRun("models/user.test.ts");
    expect(result).not.toContain("create_table(:users)");
  });

  it("sql structure migrations", async (t) => {
    const output = await t.trails("generate", "model", "user", "name:string");
    const version = output.match(/(\d+)_create_users\.ts/)![1];

    await t.appFile(
      "test/models/user.test.ts",
      `import "../test-helper.ts";
import { describe, it } from "vitest";
import { User } from "../../app/models/user.ts";

describe("UserTest", () => {
  it("user", async () => {
    await User.createBang({ name: "Jon" });
  });
});
`,
    );

    await t.appFile("db/structure.sql", "");
    await t.appFile(
      "config/initializers/enable-sql-schema-format.ts",
      `import { Trails } from "@blazetrails/trailties";

Trails.application.config.activeRecord.schemaFormat = "sql";
`,
    );

    await t.assertUnsuccessfulRun("models/user.test.ts", "Migrations are pending");

    await t.appFile(
      "db/structure.sql",
      `CREATE TABLE "schema_migrations" ("version" varchar(255) NOT NULL);
CREATE UNIQUE INDEX "unique_schema_migrations" ON "schema_migrations" ("version");
CREATE TABLE "users" ("id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, "name" varchar(255));
INSERT INTO schema_migrations (version) VALUES ('${version}');
`,
    );

    await t.appFile(
      "config/initializers/disable-maintain-test-schema.ts",
      `import { Trails } from "@blazetrails/trailties";

Trails.application.config.activeRecord.maintainTestSchema = false;
`,
    );

    await t.assertUnsuccessfulRun("models/user.test.ts", "Could not find table 'users'");

    await File.deleteAsync(
      `${await t.appPath()}/config/initializers/disable-maintain-test-schema.ts`,
    );

    await t.assertSuccessfulTestRun("models/user.test.ts");
  });
});
