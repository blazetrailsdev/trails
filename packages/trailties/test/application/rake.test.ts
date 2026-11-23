import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { Isolation } from "@blazetrails/activesupport/testing/isolation";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { constGet, File, include, rbFBackquote, TopLevel } from "@blazetrails/ruby-compat";
import { Trails } from "../../lib/trails.js";
import { EnvHelpers } from "../support/env-helpers.js";
import type { Generation } from "../support/isolation/abstract-unit.js";
import "../support/isolation/abstract-unit.js";

class RakeTest extends TestCase {}
include(RakeTest, Isolation);
include(RakeTest, EnvHelpers);
registerSpecType(/^RakeTest$/, RakeTest);

type Counted = { count(): Promise<number> };

describe("RakeTest", { timeout: 600_000 }, () => {
  let t: Generation;
  let appPath: string;

  beforeEach(async () => {
    t = new RakeTest("test") as unknown as Generation;
    await t.buildApp();
    appPath = await t.appPath();
  });

  afterEach(() => t.teardownApp());

  async function rakeTasks(body: string): Promise<void> {
    const file = `${appPath}/config/application.ts`;
    await File.writeAsync(
      file,
      `import { DSL } from "@blazetrails/rake";\nimport { block, constGet } from "@blazetrails/ruby-compat";\n${await File.readAsync(file)}`,
    );
    await t.addToConfig(`this.rakeTasks(() => {\n${body}\n});`);
  }

  it("gems tasks are loaded first than application ones", async () => {
    await t.appFile(
      "lib/tasks/app.rake.ts",
      `(globalThis as { taskLoaded?: boolean }).taskLoaded = (await import("@blazetrails/rake")).Task.isTaskDefined("db:create:all");\n`,
    );

    await t.bootTrails();
    await Trails.application!.loadTasks();
    expect((globalThis as { taskLoaded?: boolean }).taskLoaded).toBeTruthy();
  });

  it("framework tasks are evaluated only once", async () => {
    expect([...(await t.trails("about")).matchAll(/^Trails version/gm)].map((m) => m[0])).toEqual([
      "Trails version",
    ]);
  });

  it("tasks can invoke framework tasks via Rails::Command.invoke", async () => {
    await rakeTasks(`DSL.task("invoke_about", block(async () => { await Trails.Command!.invoke("about");
}));`);

    expect(await t.trails("invoke_about")).toMatch(/^Trails version/m);
  });

  it("help arguments describe rake tasks", async () => {
    const taskDescription = `bin/trails db:migrate
    Migrate the database (options: VERSION=x, VERBOSE=false, SCOPE=blog).
`;

    expect(await t.trails("db:migrate", "-h")).toMatch(taskDescription);
  });

  it("task backtrace is silenced", async () => {
    await rakeTasks(`DSL.task("boom", block(() => {
  throw new Error("boom");
}));`);

    const backtrace = (await t.trails("boom", { allowFailure: true }))
      .split("\n")
      .filter((line) => /^\s*at .*:\d+:\d+\)?$/.test(line));
    const appLines = backtrace.filter((line) => line.includes(appPath));
    const frameworkLines = backtrace.filter((line) => !line.includes(appPath));

    expect(appLines).not.toBeEmpty();
    expect(frameworkLines).toBeEmpty();
  });

  it("task is protected when previous migration was production", async () => {
    await t.withTrailsEnv("production", async () => {
      await t.trails("generate", "model", "product", "name:string");
      await t.trails("db:create", "db:migrate");
      const output = await t.trails("db:test:prepare", { allowFailure: true });

      expect(output).toMatch(/ActiveRecord::ProtectedEnvironmentError/);
    });
  });

  it("not protected when previous migration was not production", async () => {
    await t.withTrailsEnv("test", async () => {
      await t.trails("generate", "model", "product", "name:string");
      await t.trails("db:create", "db:migrate");
      const output = await t.trails("db:test:prepare", "test");

      expect(output).not.toMatch(/ActiveRecord::ProtectedEnvironmentError/);
    });
  });

  it("environment is required in rake tasks", async () => {
    await t.appFile(
      "config/environment.ts",
      `import { setLoadImporter } from "@blazetrails/ruby-compat";
import { Trails } from "@blazetrails/trailties";

import "./application.ts";

export class SuperMiddleware {
  app: unknown;

  constructor(app: unknown) {
    this.app = app;
  }
}

Trails.application.configure(function () {
  this.config.middleware.use(SuperMiddleware);
});

Trails.autoloaders.each((loader) => {
  loader.importer = (url) => import(url);
});
setLoadImporter((url) => import(url));

export default await Trails.initialize();
`,
    );

    expect(await t.trails("middleware")).toMatch("SuperMiddleware");
  });

  it("initializers are executed in rake tasks", async () => {
    await t.addToConfig(`this.initializer("do_something", () => {
  console.log("Doing something...");
});`);
    await rakeTasks(`DSL.task({ do_nothing: "environment" }, block(() => {}));`);

    const output = await t.trails("do_nothing");
    expect(output).toMatch("Doing something...");
  });

  it("does not explode when accessing a model", async () => {
    await rakeTasks(`DSL.task({ do_nothing: "environment" }, block(() => {
  new (constGet(TopLevel, "Hello") as new () => { world(): void })().world();
}));`);

    await t.appFile(
      "app/models/hello.ts",
      `export class Hello {
  world() {
    console.log("Hello world");
  }
}
`,
    );

    const output = await t.trails("do_nothing");
    expect(output).toMatch("Hello world");
  });

  // PERMANENT-SKIP: CLAUDE.md, "The application loader is Zeitwerk (`Rails.autoloaders`)"
  it.skip("should not eager load model for rake when rake eager load is false", async () => {
    await rakeTasks(`DSL.task({ do_nothing: "environment" }, block(() => {
  console.log("There is nothing");
}));`);

    await t.addToEnvConfig("production", "this.config.eagerLoad = true;");

    await t.appFile(
      "app/models/hello.ts",
      `throw new Error("should not be pre-required for rake even eager_load=true");\n`,
    );

    const output = await t.trails("do_nothing", "TRAILS_ENV=production");
    expect(output).toMatch("There is nothing");
  });

  it("should eager load model for rake when rake eager load is true", async () => {
    await rakeTasks(`DSL.task({ do_something: "environment" }, block(() => {
  console.log("Answer: " + String((constGet(TopLevel, "Hello") as { TEST: number }).TEST));
}));`);

    await t.addToEnvConfig("production", "this.config.rakeEagerLoad = true;");

    await t.appFile(
      "app/models/hello.ts",
      `export class Hello {
  static TEST = 42;
}
`,
    );

    const output = await rbFBackquote(
      `cd ${appPath}; bin/trails do_something TRAILS_ENV=production`,
    );
    expect(output.split(/(?<=\n)/).at(-1)).toBe("Answer: 42\n");
  });

  it("code statistics", async () => {
    expect(await t.trails("stats")).toMatch(
      /Code LOC: \d+\s+Test LOC: \d+\s+ Code to Test Ratio: 1:\w+/,
    );
  });

  // BLOCKED: trailties-reload-routes-in-rake-task-draws-app-routes
  it.skip("reload routes", async () => {
    await rakeTasks(`DSL.task({ do_something: "environment" }, block(async () => { await Trails.application!.reloadRoutesBang();
  console.log([...Trails.application!.routes().namedRoutes.routes.keys()].join(" "));
}));`);

    await t.appFile(
      "config/routes.ts",
      `import { Trails } from "@blazetrails/trailties";

Trails.application.routes().draw(function () {
  this.get("foo", { to: "foo#bar", as: "my_great_route" });
});
`,
    );

    const output = await rbFBackquote(`cd ${appPath}; bin/trails do_something`);
    expect(output.split("\n")[0]).toContain("my_great_route");
  });

  it("loading specific fixtures", async () => {
    await t.trails("generate", "model", "user", "username:string", "password:string");
    await t.trails("generate", "model", "product", "name:string");
    await t.trails("db:migrate");

    await t.bootTrails();

    await t.trails("db:fixtures:load", "FIXTURES=products");

    expect(await (constGet(TopLevel, "Product") as Counted).count()).toBe(2);
    expect(await (constGet(TopLevel, "User") as Counted).count()).toBe(0);
  });

  it("loading only yml fixtures", async () => {
    await t.trails("db:migrate");

    await t.appFile("test/fixtures/products.csv", "");

    await t.bootTrails();
    await t.trails("db:fixtures:load");
  });

  // BLOCKED: trailties-scaffold-views-precompiled-for-trails-test
  it.skip("scaffold tests pass by default", async () => {
    await t.trails("generate", "scaffold", "user", "username:string", "password:string");
    await t.withTrailsEnv("test", () => t.trails("db:migrate"));
    const output = await t.trails("test");

    expect(output).toMatch(/7 runs, 0 failures, 0 errors/);
    expect(output).not.toMatch(/Errors running/);
  });

  // BLOCKED: trailties-api-scaffold-generates-rails-test-count
  it.skip("api scaffold tests pass by default", async () => {
    await t.addToConfig("this.config.apiOnly = true;");

    await t.appFile(
      "app/controllers/application-controller.ts",
      `import { ActionController } from "@blazetrails/actionpack";

export class ApplicationController extends ActionController.API {}
`,
    );

    await t.trails("generate", "scaffold", "user", "username:string", "password:string");
    await t.withTrailsEnv("test", () => t.trails("db:migrate"));
    const output = await t.trails("test");

    expect(output).toMatch(/5 runs, 0 failures, 0 errors/);
    expect(output).not.toMatch(/Errors running/);
  });

  // BLOCKED: trailties-references-scaffold-model-file-loads
  it.skip("scaffold with references columns tests pass by default", async () => {
    await t.trails("generate", "model", "Product");
    await t.trails("generate", "model", "Cart");
    await t.trails("generate", "scaffold", "LineItems", "product:references", "cart:belongs_to");
    await t.withTrailsEnv("test", () => t.trails("db:migrate"));
    const output = await t.trails("test");

    expect(output).toMatch(/7 runs, 0 failures, 0 errors/);
    expect(output).not.toMatch(/Errors running/);
  });

  it("db test prepare when using sql format", async () => {
    await t.addToConfig(`this.config.activeRecord.schemaFormat = "sql";`);
    await t.trails("generate", "scaffold", "user", "username:string");
    await t.trails("db:migrate");
    const output = await t.trails("db:test:prepare", "--trace");
    expect(output).toMatch(/Execute db:test:load_schema/);
  });

  it("rake dump structure should be called twice when migrate redo", async () => {
    await t.addToConfig(`this.config.activeRecord.schemaFormat = "sql";`);

    await t.trails("g", "model", "post", "title:string");
    const output = await t.trails("db:migrate:redo", "--trace");

    expect(output).not.toMatch(/^\*\* Invoke db:structure:dump\s+$/m);
  });

  it("rake dump schema cache", async () => {
    await t.trails("generate", "model", "post", "title:string");
    await t.trails("generate", "model", "product", "name:string");
    await t.trails("db:migrate", "db:schema:cache:dump");
    expect(await File.isExistAsync(File.join(appPath, "db", "schema_cache.yml"))).toBeTruthy();
  });

  it("rake clear schema cache", async () => {
    await t.trails("db:schema:cache:dump", "db:schema:cache:clear");
    expect(await File.isExistAsync(File.join(appPath, "db", "schema_cache.yml"))).toBeFalsy();
  });

  it("copy templates", async () => {
    await t.trails("app:templates:copy");
    for (const dir of ["controller", "mailer", "scaffold"]) {
      expect(
        await File.isExistAsync(File.join(appPath, "lib", "templates", "tse", dir)),
      ).toBeTruthy();
    }
    for (const dir of ["controller", "helper", "scaffold-controller"]) {
      expect(
        await File.isExistAsync(File.join(appPath, "lib", "templates", "trails", dir)),
      ).toBeTruthy();
    }
  });

  it("template load initializers", async () => {
    await t.appFile("config/initializers/dummy.ts", `console.log("Hello, World!");\n`);
    await t.appFile("template.ts", "export default function () {}\n");

    const output = await t.trails("app:template", "LOCATION=template.ts");
    expect(output).toMatch(/Hello, World!/);
  });
});
