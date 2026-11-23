import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { Isolation } from "@blazetrails/activesupport/testing/isolation";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { Methods } from "@blazetrails/rack-test";
import { constGet, include, setEnv, TopLevel } from "@blazetrails/ruby-compat";
import { disablePreparedStatements, QueryLogs, queryTransformers } from "@blazetrails/activerecord";
import { Application } from "../../lib/application.js";
import { Trails } from "../../lib/trails.js";
import type { Generation, Rack } from "../support/isolation/abstract-unit.js";
import "../support/isolation/abstract-unit.js";

class QueryLogsTest extends TestCase {}
include(QueryLogsTest, Isolation);
include(QueryLogsTest, Methods);
registerSpecType(/^QueryLogsTest$/, QueryLogsTest);

type Host = Generation &
  Omit<Rack, "get"> & {
    get(path: string, params?: unknown, env?: Record<string, unknown>): Promise<unknown>;
    lastResponse(): { status: number; body: string };
  };

type UserJobClass = new () => { performNow(): Promise<string> };

describe("QueryLogsTest", { timeout: 300_000 }, () => {
  let t: Host;

  beforeEach(async () => {
    t = new QueryLogsTest("test") as unknown as Host;
    await t.buildApp({ multiDb: true });
    await t.trails("generate", "scaffold", "Pet", "name:string", "--database=animals");
    await t.appFile(
      "app/models/user.ts",
      `
import { Base } from "@blazetrails/activerecord";
export class User extends Base {}
`,
    );

    await t.appFile(
      "app/controllers/users-controller.ts",
      `
import { QueryLogs } from "@blazetrails/activerecord";
import { ApplicationController } from "./application-controller.ts";
import { Pet } from "../models/pet.ts";
export class UsersController extends ApplicationController {
  async index() {
    await this.render({ inline: QueryLogs.call("", await Pet.leaseConnection()) });
  }

  dynamicContent() {
    return String(Date.now() / 1000);
  }
}
`,
    );

    await t.appFile(
      "app/controllers/name-spaced/users-controller.ts",
      `
import { Base, QueryLogs } from "@blazetrails/activerecord";
import { ApplicationController } from "../application-controller.ts";
export class UsersController extends ApplicationController {
  async index() {
    await this.render({ inline: QueryLogs.call("", await Base.leaseConnection()) });
  }
}
`,
    );

    await t.appFile(
      "app/jobs/user-job.ts",
      `
import { Base as ActiveJobBase } from "@blazetrails/activejob";
import { Base, QueryLogs } from "@blazetrails/activerecord";
export class UserJob extends ActiveJobBase {
  async perform() {
    return QueryLogs.call("", await Base.leaseConnection());
  }

  dynamicContent() {
    return String(Date.now() / 1000);
  }
}
`,
    );

    await t.appFile(
      "config/routes.ts",
      `
import { Trails } from "@blazetrails/trailties";
Trails.application!.routes().draw(function () {
  this.get("/", { to: "users#index" });
  this.get("/namespaced/users", { to: "name_spaced/users#index" });
});
`,
    );
  });

  afterEach(async () => {
    await t.teardownApp();
    Trails.application = null;
    Application.appClass = null;
  });

  async function bootApp(env = "production"): Promise<void> {
    setEnv("TRAILS_ENV", env);
    try {
      await t.bootTrails();
    } finally {
      setEnv("TRAILS_ENV", undefined);
    }
  }

  const userJob = () => constGet(TopLevel, "UserJob") as UserJobClass;

  it("does not modify the query execution path by default", async () => {
    await bootApp();

    expect(queryTransformers()).not.toContain(QueryLogs);
  });

  it("prepends the query execution path when enabled", async () => {
    await t.addToConfig("this.config.activeRecord.queryLogTagsEnabled = true;");

    await bootApp();

    expect(queryTransformers()).toContain(QueryLogs);
  });

  it("disables prepared statements when enabled", async () => {
    await t.addToConfig("this.config.activeRecord.queryLogTagsEnabled = true;");

    await bootApp();

    expect(disablePreparedStatements()).toBeTruthy();
  });

  it("controller and job tags are defined by default", async () => {
    await t.addToConfig("this.config.activeRecord.queryLogTagsEnabled = true;");
    await t.appFile(
      "config/initializers/active-record.ts",
      `
import { Base } from "@blazetrails/activerecord";
if (!(await Base.leaseConnection()).preparedStatements) throw new Error("Expected prepared_statements to be enabled");
await (await Base.leaseConnection()).execute("SELECT 1");
`,
    );

    await bootApp();

    expect(QueryLogs.tags).toEqual(["application", "controller", "action", "job"]);
  });

  it("controller actions have tagging filters enabled by default", async () => {
    await t.addToConfig("this.config.activeRecord.queryLogTagsEnabled = true;");
    await t.addToConfig(`this.config.activeRecord.queryLogTagsFormat = "legacy";`);

    await bootApp();

    await t.get("/", {}, { HTTPS: "on" });
    const comment = t.lastResponse().body.trim();

    expect(comment).toContain("controller:users");
  });

  it("sqlcommenter formatting works when specified", async () => {
    await t.addToConfig("this.config.activeRecord.queryLogTagsEnabled = true;");
    await t.addToConfig(`this.config.activeRecord.queryLogTagsFormat = "sqlcommenter";`);

    await t.addToConfig(`this.config.activeRecord.queryLogTags = ["pid"];`);

    await bootApp();

    await t.get("/", {}, { HTTPS: "on" });
    const comment = t.lastResponse().body.trim();

    expect(comment).toMatch(/pid='\d+'/);
    expect(comment).toContain("controller='users'");
  });

  it("controller actions tagging filters can be disabled", async () => {
    await t.addToConfig("this.config.activeRecord.queryLogTagsEnabled = true;");
    await t.addToConfig("this.config.actionController.logQueryTagsAroundActions = false;");

    await bootApp();

    await t.get("/", {}, { HTTPS: "on" });
    const comment = t.lastResponse().body.trim();

    expect(comment).not.toContain("controller:users");
  });

  it("database information works with multiple database applications", async () => {
    await t.addToConfig("this.config.activeRecord.queryLogTagsEnabled = true;");
    await t.addToConfig(
      `this.config.activeRecord.queryLogTags = ["socket", "db_host", "database"];`,
    );

    await bootApp();

    await t.get("/", {}, { HTTPS: "on" });
    const comment = t.lastResponse().body.trim();

    expect(comment).toBe(
      "/*action='index',controller='users',database='storage%2Fproduction_animals.sqlite3'*/",
    );
  });

  it("source_location information is added if enabled", async () => {
    await t.addToConfig(`
this.config.activeRecord.queryLogTagsEnabled = true;
this.config.activeRecord.queryLogTags = ["source_location"];

Trails.backtraceCleaner.removeSilencersBang();
`);

    await bootApp();

    await t.get("/", {}, { HTTPS: "on" });
    const comment = t.lastResponse().body.trim();

    expect(comment).toMatch(/source_location='.*\d+'/);
  });

  it("controller tags are not doubled up if already configured", async () => {
    await t.addToConfig("this.config.activeRecord.queryLogTagsEnabled = true;");
    await t.addToConfig(
      `this.config.activeRecord.queryLogTags = ["action", "job", "controller", "pid"];`,
    );

    await bootApp();

    await t.get("/", {}, { HTTPS: "on" });
    const comment = t.lastResponse().body.trim();

    expect(comment).toMatch(/\/\*action='index',controller='users',pid='\d+'\*\//);
  });

  it("namespace controller tags are not doubled up if already configured", async () => {
    await t.addToConfig("this.config.activeRecord.queryLogTagsEnabled = true;");
    await t.addToConfig(
      `this.config.activeRecord.queryLogTags = ["action", "job", "namespaced_controller", "pid"];`,
    );

    await bootApp();

    await t.get("/", {}, { HTTPS: "on" });
    const comment = t.lastResponse().body.trim();

    expect(comment).toMatch(/\/\*action='index',namespaced_controller='users',pid='\d+'\*\//);
  });

  it("job perform method has tagging filters enabled by default", async () => {
    await t.addToConfig("this.config.activeRecord.queryLogTagsEnabled = true;");

    await bootApp();

    const comment = await new (userJob())().performNow();

    expect(comment).toContain("UserJob");
  });

  it("job perform method tagging filters can be disabled", async () => {
    await t.addToConfig("this.config.activeRecord.queryLogTagsEnabled = true;");
    await t.addToConfig("this.config.activeJob.logQueryTagsAroundPerform = false;");

    await bootApp();

    const comment = await new (userJob())().performNow();

    expect(comment).not.toContain("UserJob");
  });

  it("job tags are not doubled up if already configured", async () => {
    await t.addToConfig("this.config.activeRecord.queryLogTagsEnabled = true;");
    await t.addToConfig(
      `this.config.activeRecord.queryLogTags = ["action", "job", "controller", "pid"];`,
    );

    await bootApp();

    const comment = await new (userJob())().performNow();

    expect(comment).toMatch(/\/\*job='UserJob',pid='\d+'\*\//);
  });

  it("query cache is cleared between requests", async () => {
    await t.addToConfig("this.config.activeRecord.queryLogTagsEnabled = true;");
    await t.addToConfig("this.config.activeRecord.cacheQueryLogTags = true;");
    await t.addToConfig(
      `this.config.activeRecord.queryLogTags = [{ dynamic: (context) => context.controller?.dynamicContent() }];`,
    );

    await bootApp();

    await t.get("/", {}, { HTTPS: "on" });

    const firstTags = t.lastResponse().body;

    await t.get("/", {}, { HTTPS: "on" });

    const secondTags = t.lastResponse().body;

    expect(firstTags).not.toEqual(secondTags);
  });

  it("query cache is cleared between job executions", async () => {
    await t.addToConfig("this.config.activeRecord.queryLogTagsEnabled = true;");
    await t.addToConfig("this.config.activeRecord.cacheQueryLogTags = true;");
    await t.addToConfig(
      `this.config.activeRecord.queryLogTags = [{ dynamic: (context) => context.job?.dynamicContent() }];`,
    );

    await bootApp();

    const firstTags = await new (userJob())().performNow();
    const secondTags = await new (userJob())().performNow();

    expect(firstTags).not.toEqual(secondTags);
  });

  it("controller and namespaced_controller are named correctly", async () => {
    await t.addToConfig("this.config.activeRecord.queryLogTagsEnabled = true;");
    await t.addToConfig(
      `this.config.activeRecord.queryLogTags = ["action", "namespaced_controller", "controller"];`,
    );

    await bootApp();

    await t.get("/", {}, { HTTPS: "on" });
    let comment = t.lastResponse().body.trim();
    expect(comment).toBe("/*action='index',controller='users',namespaced_controller='users'*/");

    await t.get("/namespaced/users", {}, { HTTPS: "on" });
    comment = t.lastResponse().body.trim();
    expect(comment).toBe(
      "/*action='index',controller='users',namespaced_controller='name_spaced%2Fusers'*/",
    );
  });

  it("controller and namespaced_controller are named correctly, legacy", async () => {
    await t.addToConfig("this.config.activeRecord.queryLogTagsEnabled = true;");
    await t.addToConfig(
      `this.config.activeRecord.queryLogTags = ["action", "namespaced_controller", "controller"];`,
    );
    await t.addToConfig(`this.config.activeRecord.queryLogTagsFormat = "legacy";`);

    await bootApp();

    await t.get("/", {}, { HTTPS: "on" });
    let comment = t.lastResponse().body.trim();
    expect(comment).toMatch(/\/\*action:index,controller:users,namespaced_controller:users\*\//);

    await t.get("/namespaced/users", {}, { HTTPS: "on" });
    comment = t.lastResponse().body.trim();
    expect(comment).toMatch(
      /\/\*action:index,controller:users,namespaced_controller:name_spaced\/users\*\//,
    );
  });
});
