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

function it(name: string, block: (t: Host) => Promise<void>, skip = false): void {
  test.skipIf(skip)(name, async () => {
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

  it("after_run", async (t) => {
    await t.appFile(
      "test/unit/foo.test.ts",
      `
        import "../test-helper.ts";
        import { afterAll, describe, it, expect } from "vitest";

        afterAll(() => console.log("WORLD"));
        afterAll(() => console.log("HELLO"));

        describe("FooTest", () => {
          it("truth", () => {
            expect(true).toBe(true);
          });
        });
`,
    );

    const result = await t.assertSuccessfulTestRun("unit/foo.test.ts");
    expect(result.match(/HELLO|WORLD/g)).toEqual(["HELLO", "WORLD"]);
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

  it("integration test", async (t) => {
    await t.controller(
      "posts",
      `import { ActionController } from "@blazetrails/actionpack";

export class PostsController extends ActionController.Base {}
`,
    );

    await t.appFile("app/views/posts/index.html.tse", "        Posts#index\n");

    await t.appFile(
      "test/integration/posts.test.ts",
      `import { describe, it, expect } from "vitest";
import { IntegrationTest } from "@blazetrails/actionpack/testing";
import { constSet } from "@blazetrails/ruby-compat/include";
import { TopLevel } from "@blazetrails/ruby-compat/object";
import "../test-helper.ts";

export class PostsTest extends IntegrationTest {
  static {
    constSet(TopLevel, "PostsTest", this);
  }
}

describe("PostsTest", () => {
  it<{ testCase: PostsTest }>("test_index", async ({ testCase: t }) => {
    await t.get("/posts");
    t.assertResponse(":success");
    expect(t.response.body).toContain("Posts#index");
  });
});
`,
    );

    await t.assertSuccessfulTestRun("integration/posts.test.ts");
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
    expect(result).not.toContain(`createTable("users")`);
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

  it("sql structure migrations when adding column to existing table", async (t) => {
    const output1 = await t.trails("generate", "model", "user", "name:string");
    const version1 = output1.match(/(\d+)_create_users\.ts/)![1];

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

    await t.appFile(
      "config/initializers/enable-sql-schema-format.ts",
      `import { Trails } from "@blazetrails/trailties";

Trails.application.config.activeRecord.schemaFormat = "sql";
`,
    );

    await t.appFile(
      "db/structure.sql",
      `CREATE TABLE "schema_migrations" ("version" varchar(255) NOT NULL);
CREATE UNIQUE INDEX "unique_schema_migrations" ON "schema_migrations" ("version");
CREATE TABLE "users" ("id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, "name" varchar(255));
INSERT INTO schema_migrations (version) VALUES ('${version1}');
`,
    );

    await t.assertSuccessfulTestRun("models/user.test.ts");

    const output2 = await t.trails("generate", "migration", "add_email_to_users");
    const version2 = output2.match(/(\d+)_add_email_to_users\.ts/)![1];

    await t.appFile(
      "test/models/user.test.ts",
      `import "../test-helper.ts";
import { describe, it } from "vitest";
import { User } from "../../app/models/user.ts";

describe("UserTest", () => {
  it("user", async () => {
    await User.createBang({ name: "Jon", email: "jon@doe.com" });
  });
});
`,
    );

    await t.appFile(
      "db/structure.sql",
      `CREATE TABLE "schema_migrations" ("version" varchar(255) NOT NULL);
CREATE UNIQUE INDEX "unique_schema_migrations" ON "schema_migrations" ("version");
CREATE TABLE "users" ("id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, "name" varchar(255), "email" varchar(255));
INSERT INTO schema_migrations (version) VALUES ('${version1}');
INSERT INTO schema_migrations (version) VALUES ('${version2}');
`,
    );

    await t.assertSuccessfulTestRun("models/user.test.ts");
  });

  it("automatically synchronizes test schema after rollback", async (t) => {
    const output = await t.trails("generate", "model", "user", "name:string");
    const version = output.match(/(\d+)_create_users\.ts/)![1];

    await t.appFile(
      "test/models/user.test.ts",
      `import "../test-helper.ts";
import { describe, it, expect } from "vitest";
import { User } from "../../app/models/user.ts";

describe("UserTest", () => {
  it("user", async () => {
    expect(Object.keys(User.columnsHash())).toEqual(["id", "name"]);
  });
});
`,
    );
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

    await t.assertSuccessfulTestRun("models/user.test.ts");

    await t.appFile(
      "db/schema.ts",
      `import { Schema } from "@blazetrails/activerecord";

await Schema.define({ version: ${version} }, async (ctx) => {
  await ctx.createTable("users", (t) => {
    t.string("name");
    t.integer("age");
  });
});
`,
    );

    await t.assertUnsuccessfulRun(
      "models/user.test.ts",
      "expected [ 'id', 'name', 'age' ] to deeply equal [ 'id', 'name' ]",
    );
  });

  it("hooks for plugins", async (t) => {
    const output = await t.trails("generate", "model", "user", "name:string");
    const version = output.match(/(\d+)_create_users\.ts/)![1];

    await t.appFile(
      "lib/tasks/hooks.rake.ts",
      `import { DSL, Task } from "@blazetrails/rake";
import { block } from "@blazetrails/ruby-compat/hash";
import { Base } from "@blazetrails/activerecord";

DSL.task(
  "before_hook",
  block(async () => {
    const hasUserTable = await (await Base.leaseConnection()).tableExists("users");
    console.log("before: " + String(hasUserTable));
  }),
);

DSL.task(
  "after_hook",
  block(async () => {
    const hasUserTable = await (await Base.leaseConnection()).tableExists("users");
    console.log("after: " + String(hasUserTable));
  }),
);

(await Task.get("db:test:prepare")).enhance(
  ["before_hook"],
  block(async () => {
    await (await Task.get("after_hook")).invoke();
  }),
);
`,
    );
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

    let result = await t.assertSuccessfulTestRun("models/user.test.ts");
    expect(result).toContain("before: false\nafter: true");

    result = await t.assertSuccessfulTestRun("models/user.test.ts");
    expect(result).not.toContain("before:");
    expect(result).not.toContain("after:");
  });

  it("schema for all the models is loaded when tests are run in eager load context", async (t) => {
    const output = await t.trails("generate", "model", "user", "name:string");
    const version = output.match(/(\d+)_create_users\.ts/)![1];

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
      "config/initializers/enable-eager-load.ts",
      `import { Trails } from "@blazetrails/trailties";

Trails.application.config.eagerLoad = true;
`,
    );

    await t.appFile(
      "app/models/user.ts",
      `import { ApplicationRecord } from "./application-record.ts";

export class User extends ApplicationRecord {
  static override async loadSchemaBang(): Promise<void> {
    await super.loadSchemaBang();
    throw new Error("SCHEMA LOADED!");
  }
}
`,
    );

    await t.assertUnsuccessfulRun("models/user.test.ts", "SCHEMA LOADED!");
  });

  it(
    "database-dependent attribute types are resolved when parallel tests are run in eager load context",
    async (t) => {
      await t.usePostgresql();
      try {
        await t.trails("db:drop", "db:create");

        const output = await t.trails("generate", "model", "user");
        const version = output.match(/(\d+)_create_users\.ts/)![1];

        await t.appFile(
          "db/schema.ts",
          `import { Schema } from "@blazetrails/activerecord";

await Schema.define({ version: ${version} }, async (ctx) => {
  await ctx.createEnum("user_favorite_color", ["red", "green", "blue"]);

  await ctx.createTable("users", (t) => {
    t.enum("favorite_color", { enumType: "user_favorite_color" });
  });
});
`,
        );

        await t.appFile(
          "config/initializers/enable-eager-load.ts",
          `import { Trails } from "@blazetrails/trailties";

Trails.application.config.eagerLoad = true;
`,
        );

        await t.appFile(
          "test/models/user.test.ts",
          `import "../test-helper.ts";
import { describe, it, expect } from "vitest";
import { ActiveSupport } from "@blazetrails/activesupport";
import { setEnv } from "@blazetrails/ruby-compat/process-adapter";
import { OID } from "@blazetrails/activerecord/connection-adapters/postgresql/oid";
import { User } from "../../app/models/user.ts";

describe("UserTest", () => {
  setEnv("PARALLEL_WORKERS", undefined);
  ActiveSupport.TestCase.parallelize({ threshold: 1, workers: 2 });

  for (let i = 0; i < 2; i++) {
    it(\`favorite_color uses database type (worker \${i})\`, () => {
      expect(User.typeForAttribute("favorite_color")).toBeInstanceOf(OID.Enum);
    });
  }
});
`,
        );

        await t.assertSuccessfulTestRun("models/user.test.ts");
      } finally {
        await t.trails("db:drop").catch(() => null);
      }
    },
    ENV["ARCONN"] !== "postgresql",
  );
});
