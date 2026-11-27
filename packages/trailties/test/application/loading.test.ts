import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { Isolation } from "@blazetrails/activesupport/testing/isolation";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { Methods } from "@blazetrails/rack-test";
import { include } from "@blazetrails/ruby-compat/include";
import { constGet, NameError, RuntimeError, TopLevel } from "@blazetrails/ruby-compat";
import { Base, Migration, Schema } from "@blazetrails/activerecord";
import { Application } from "../../lib/application.js";
import { Trails } from "../../lib/trails.js";
import type { Generation, Rack } from "../support/isolation/abstract-unit.js";
import "../support/isolation/abstract-unit.js";

class LoadingTest extends TestCase {}
include(LoadingTest, Isolation);
include(LoadingTest, Methods);
registerSpecType(/^LoadingTest$/, LoadingTest);

type Host = Generation &
  Omit<Rack, "get"> & {
    get(path: string, params?: unknown, env?: Record<string, unknown>): Promise<unknown>;
    lastResponse(): { status: number; body: string };
  };

describe("LoadingTest", { timeout: 120_000 }, () => {
  let t: Host;

  beforeEach(async () => {
    t = new LoadingTest("test") as unknown as Host;
    await t.buildApp();
  });

  afterEach(async () => {
    await t.teardownApp();
    Trails.application = null;
    Application.appClass = null;
  });

  it("reload constants on development", async () => {
    await t.addToConfig("this.config.enableReloading = true;");

    await t.appFile(
      "config/routes.ts",
      `
import { Trails } from "@blazetrails/trailties";
import { constGet, TopLevel } from "@blazetrails/ruby-compat";
Trails.application!.routes().draw(function () {
  this.get("/c", {
    to: async () => [200, { "Content-Type": "text/plain" }, [String((constGet(TopLevel, "User") as { counter(): number }).counter())]],
  });
});
`,
    );

    await t.appFile(
      "app/models/user.ts",
      `
export class User {
  static counter() { return 1; }
}
`,
    );

    await t.bootTrails();

    await t.get("/c");
    expect(t.lastResponse().body).toBe("1");

    await t.appFile(
      "app/models/user.ts",
      `
export class User {
  static counter() { return 2; }
}
`,
    );

    await t.get("/c");
    expect(t.lastResponse().body).toBe("2");
  });

  it("added files (like db/schema.rb) also trigger reloading", async () => {
    await t.addToConfig("this.config.enableReloading = true;");

    await t.appFile(
      "config/routes.ts",
      `
import { Trails } from "@blazetrails/trailties";
import { constGet, TopLevel } from "@blazetrails/ruby-compat";
const globals = TopLevel as unknown as Record<string, number>;
globals.counter ??= 0;
Trails.application!.routes().draw(function () {
  this.get("/c", {
    to: async () => {
      constGet(TopLevel, "User");
      return [200, { "Content-Type": "text/plain" }, [String(globals.counter)]];
    },
  });
});
`,
    );

    await t.appFile(
      "app/models/user.ts",
      `
import { TopLevel } from "@blazetrails/ruby-compat";
const globals = TopLevel as unknown as Record<string, number>;
globals.counter = (globals.counter ?? 0) + 1;
export class User {}
`,
    );

    await t.bootTrails();

    await t.get("/c");
    expect(t.lastResponse().body).toBe("1");

    await t.appFile("db/schema.ts", "");

    await t.get("/c");
    expect(t.lastResponse().body).toBe("2");
  });

  it("concerns in app are autoloaded", async () => {
    await t.appFile("app/controllers/concerns/trackable.ts", "export const Trackable = {};");
    await t.appFile("app/mailers/concerns/email-loggable.ts", "export const EmailLoggable = {};");
    await t.appFile("app/models/concerns/orderable.ts", "export const Orderable = {};");
    await t.appFile("app/validators/concerns/matchable.ts", "export const Matchable = {};");

    await t.bootTrails();

    expect(() => constGet(TopLevel, "Trackable")).not.toThrow();
    expect(() => constGet(TopLevel, "EmailLoggable")).not.toThrow();
    expect(() => constGet(TopLevel, "Orderable")).not.toThrow();
    expect(() => constGet(TopLevel, "Matchable")).not.toThrow();
  });

  it("load config/environments/environment before Bootstrap initializers", async () => {
    await t.appFile(
      "config/environments/development.ts",
      `import { Trails } from "@blazetrails/trailties";
Trails.application.configure(function () {
  (this.config as unknown as Record<string, unknown>).developmentEnvironmentLoaded = true;
});`,
    );

    await t.addToConfig(`this.config.beforeInitialize(function () {
      const config = Trails.application!.config as unknown as Record<string, unknown>;
      config.loaded = config.developmentEnvironmentLoaded;
    });`);

    await t.bootTrails();
    expect((Trails.application!.config as unknown as Record<string, unknown>).loaded).toBeTruthy();
  });

  it("initialize can't be called twice", async () => {
    await t.bootTrails();
    await expect(Trails.application!.initializeBang()).rejects.toThrow(RuntimeError);
  });

  it("does not reload constants on development if custom file watcher always returns false", async () => {
    await t.addToConfig(`this.config.enableReloading = true;
    this.config.fileWatcher = class {
      constructor(..._args: unknown[]) {}
      isUpdated() { return false; }
      async execute() {}
      async executeIfUpdated() { return false; }
    };`);

    await t.appFile(
      "config/routes.ts",
      `
import { Trails } from "@blazetrails/trailties";
import { constGet, TopLevel } from "@blazetrails/ruby-compat";
Trails.application!.routes().draw(function () {
  this.get("/c", {
    to: async () => [200, { "Content-Type": "text/plain" }, [String((constGet(TopLevel, "User") as { counter(): number }).counter())]],
  });
});
`,
    );

    await t.appFile(
      "app/models/user.ts",
      "export class User {\n  static counter() { return 1; }\n}\n",
    );

    await t.bootTrails();

    await t.get("/c");
    expect(t.lastResponse().body).toBe("1");

    await t.appFile(
      "app/models/user.ts",
      "export class User {\n  static counter() { return 2; }\n}\n",
    );

    await t.get("/c");
    expect(t.lastResponse().body).toBe("1");
  });

  // BLOCKED: trailties-tests-broken-while-shards-ran-zero
  it.skip("dependencies reloading is followed by routes reloading", async () => {
    await t.addToConfig("this.config.enableReloading = true;");

    await t.appFile(
      "config/routes.ts",
      `
import { Trails } from "@blazetrails/trailties";
import { constGet, TopLevel } from "@blazetrails/ruby-compat";
const globals = TopLevel as unknown as Record<string, number>;
globals.counter ??= 1;
globals.counter *= 2;
Trails.application!.routes().draw(function () {
  this.get("/c", {
    to: async () => {
      constGet(TopLevel, "User");
      return [200, { "Content-Type": "text/plain" }, [String(globals.counter)]];
    },
  });
});
`,
    );

    await t.appFile(
      "app/models/user.ts",
      `
import { TopLevel } from "@blazetrails/ruby-compat";
const globals = TopLevel as unknown as Record<string, number>;
globals.counter += 1;
export class User {}
`,
    );

    await t.bootTrails();

    await t.get("/c");
    expect(t.lastResponse().body).toBe("3");

    await t.appFile("db/schema.ts", "");

    await t.get("/c");
    expect(t.lastResponse().body).toBe("7");
  });

  // BLOCKED: trailties-tests-broken-while-shards-ran-zero
  it.skip("routes reloading triggers after_routes_loaded", async () => {
    await t.addToConfig("this.config.enableReloading = true;");

    await t.appFile(
      "config/routes.ts",
      `
import { Trails } from "@blazetrails/trailties";
import { constGet, TopLevel } from "@blazetrails/ruby-compat";
const globals = TopLevel as unknown as Record<string, number>;
globals.counter ??= 1;
globals.counter *= 2;
Trails.application!.routes().draw(function () {
  this.get("/c", {
    to: async () => {
      constGet(TopLevel, "User");
      return [200, { "Content-Type": "text/plain" }, [String(globals.counter)]];
    },
  });
});
`,
    );

    await t.appFile(
      "config/initializers/after-routes-loaded.ts",
      `
import { Trails } from "@blazetrails/trailties";
import { TopLevel } from "@blazetrails/ruby-compat";
const globals = TopLevel as unknown as Record<string, number>;
Trails.configuration!.afterRoutesLoaded(() => {
  globals.counter *= 3;
});
`,
    );

    await t.appFile(
      "app/models/user.ts",
      `
import { TopLevel } from "@blazetrails/ruby-compat";
const globals = TopLevel as unknown as Record<string, number>;
globals.counter += 1;
export class User {}
`,
    );

    await t.bootTrails();

    await t.get("/c");
    expect(t.lastResponse().body).toBe("7");

    await t.appFile("db/schema.ts", "");

    await t.get("/c");
    expect(t.lastResponse().body).toBe("43");
  });

  it("routes are only loaded once on boot", async () => {
    await t.addToConfig("this.config.enableReloading = true;");

    await t.appFile(
      "config/routes.ts",
      `
import { Trails } from "@blazetrails/trailties";
import { TopLevel } from "@blazetrails/ruby-compat";
const globals = TopLevel as unknown as Record<string, number>;
globals.counter ??= 0;
globals.counter += 1;
Trails.application!.routes().draw(function () {
  this.get("/c", {
    to: async () => [200, { "Content-Type": "text/plain" }, [String(globals.counter)]],
  });
});
`,
    );

    await t.app("development");

    await t.bootTrails();

    await t.get("/c");
    expect(t.lastResponse().body).toBe("1");
  });

  it("after_routes_loaded runs once on boot", async () => {
    await t.addToConfig("this.config.enableReloading = true;");

    await t.appFile(
      "config/routes.ts",
      `
import { Trails } from "@blazetrails/trailties";
import { TopLevel } from "@blazetrails/ruby-compat";
const globals = TopLevel as unknown as Record<string, number>;
globals.counter ??= 0;
globals.counter += 1;
Trails.application!.routes().draw(function () {
  this.get("/c", {
    to: async () => [200, { "Content-Type": "text/plain" }, [String(globals.counter)]],
  });
});
`,
    );

    await t.appFile(
      "config/initializers/after-routes-loaded.ts",
      `
import { Trails } from "@blazetrails/trailties";
import { TopLevel } from "@blazetrails/ruby-compat";
const globals = TopLevel as unknown as Record<string, number>;
Trails.configuration!.afterRoutesLoaded(() => {
  globals.counter *= 3;
});
`,
    );

    await t.app("development");

    await t.bootTrails();

    await t.get("/c");
    expect(t.lastResponse().body).toBe("3");
  });

  it("initialize can be called at any time", async () => {
    await import(await t.appPath("config", "application.ts"));

    expect(Trails.initialized()).toBeFalsy();
    expect(Trails.application!.initialized()).toBeFalsy();
    await Trails.initialize();
    expect(Trails.initialized()).toBeTruthy();
    expect(Trails.application!.initialized()).toBeTruthy();
  });

  // PERMANENT-SKIP: packages/trailties/CLAUDE.md, "The application loader is Zeitwerk"
  it.skip("frameworks aren't loaded during initialization", async () => {
    await t.appFile(
      "config/initializers/raise-when-frameworks-load.ts",
      `import { onLoad } from "@blazetrails/activesupport";
for (const framework of ["action_controller", "action_mailer", "active_job", "active_record", "action_view"]) {
  onLoad(framework, () => { throw new Error(\`\${framework} loaded!\`); });
}`,
    );

    await expect(t.bootTrails()).resolves.not.toThrow();
  });

  it("constants in app are autoloaded", async () => {
    await t.appFile(
      "app/models/post.ts",
      `import { Base } from "@blazetrails/activerecord";
export class Post extends Base {
  static {
    this.validatesAcceptanceOf("title", { accept: "omg" });
  }
}`,
    );

    await t.bootTrails();
    await setupArBang();

    const Post = constGet(TopLevel, "Post") as {
      create(attrs: object): Promise<{ title: string }>;
      first(): Promise<{ title: string }>;
      count(): Promise<number>;
    };
    let p = await Post.create({ title: "omg" });
    expect(await Post.count()).toBe(1);
    expect(p.title).toBe("omg");
    p = await Post.first();
    expect(p.title).toBe("omg");
  });

  it("models without table do not panic on scope definitions when loaded", async () => {
    await t.appFile(
      "app/models/user.ts",
      `import { Base } from "@blazetrails/activerecord";
export class User extends Base {
  static {
    this.defaultScope(() => this.where({ published: true }));
  }
}`,
    );

    await t.bootTrails();
    await setupArBang();

    constGet(TopLevel, "User");
  });
  it("AC load hooks can be used with metal", async () => {
    await t.appFile(
      "app/controllers/omg-controller.ts",
      `import { ActionController } from "@blazetrails/actionpack";
import { runLoadHooks } from "@blazetrails/activesupport";
export class OmgController extends ActionController.Metal {
  static {
    runLoadHooks("action_controller", this);
  }
  async show() {
    await this.setResponseBody(["OK"]);
  }
}`,
    );

    await t.appFile(
      "config/routes.ts",
      `import { Trails } from "@blazetrails/trailties";
Trails.application!.routes().draw(function () {
  this.get("/:controller(/:action)");
});`,
    );

    await t.bootTrails();

    await t.get("/omg/show");
    expect(t.lastResponse().body).toBe("OK");
  });

  it("active record query cache hooks are installed before first request in production", async () => {
    await t.appFile(
      "app/controllers/omg-controller.ts",
      `import { Base } from "@blazetrails/activerecord";
import { ActionController } from "@blazetrails/actionpack";
import { runLoadHooks } from "@blazetrails/activesupport";
export class OmgController extends ActionController.Metal {
  static {
    runLoadHooks("action_controller", this);
  }
  async show() {
    if ((await Base.leaseConnection()).queryCacheEnabled) {
      await this.setResponseBody(["Query cache is enabled."]);
    } else {
      await this.setResponseBody(["Expected ActiveRecord::Base.lease_connection.query_cache_enabled to be true"]);
    }
  }
}`,
    );

    await t.appFile(
      "config/routes.ts",
      `import { Trails } from "@blazetrails/trailties";
Trails.application!.routes().draw(function () {
  this.get("/:controller(/:action)");
});`,
    );

    await t.app("production");

    await t.get("/omg/show", {}, { HTTPS: "on" });
    expect(t.lastResponse().body).toBe("Query cache is enabled.");
  });

  it("active record query cache hooks are installed before first request in development", async () => {
    await t.appFile(
      "app/controllers/omg-controller.ts",
      `import { Base } from "@blazetrails/activerecord";
import { ActionController } from "@blazetrails/actionpack";
import { runLoadHooks } from "@blazetrails/activesupport";
export class OmgController extends ActionController.Metal {
  static {
    runLoadHooks("action_controller", this);
  }
  async show() {
    if ((await Base.leaseConnection()).queryCacheEnabled) {
      await this.setResponseBody(["Query cache is enabled."]);
    } else {
      await this.setResponseBody(["Expected ActiveRecord::Base.lease_connection.query_cache_enabled to be true"]);
    }
  }
}`,
    );

    await t.appFile(
      "config/routes.ts",
      `import { Trails } from "@blazetrails/trailties";
Trails.application!.routes().draw(function () {
  this.get("/:controller(/:action)");
});`,
    );

    await t.app("development");

    await t.get("/omg/show");
    expect(t.lastResponse().body).toBe("Query cache is enabled.");
  });
  it("constants without a matching file raise NameError", async () => {
    await t.appFile(
      "app/models/post.ts",
      `import { constGet } from "@blazetrails/ruby-compat";
export class Post {
  static {
    constGet(this, "NON_EXISTING_CONSTANT");
  }
}`,
    );

    let bootError!: NameError;
    const boot = Promise.resolve(t.app("development")).catch((error: unknown) => {
      bootError = error as NameError;
      throw error;
    });

    let e!: NameError;
    expect(() => {
      try {
        constGet(LoadingTest, "User");
      } catch (error) {
        e = error as NameError;
        throw error;
      }
    }).toThrow(NameError);
    expect(e.message).toMatch(`uninitialized constant ${LoadingTest.name}::User`);

    await expect(boot).rejects.toThrow(NameError);
    e = bootError;
    expect(e.message).toMatch("uninitialized constant Post::NON_EXISTING_CONSTANT");
  });

  // PERMANENT-SKIP: packages/trailties/CLAUDE.md, "The application loader is Zeitwerk"
  it.skip("descendants loaded after framework initialization are cleaned on each request if reloading is enabled", async () => {
    await t.addToConfig(`this.config.enableReloading = true;
    this.config.reloadClassesOnlyOnChange = false;`);

    await t.appFile(
      "app/models/post.ts",
      `import { ApplicationRecord } from "./application-record.js";
export class Post extends ApplicationRecord {}`,
    );

    await t.appFile(
      "config/routes.ts",
      `import { Trails } from "@blazetrails/trailties";
import { Base } from "@blazetrails/activerecord";
import { constGet, TopLevel } from "@blazetrails/ruby-compat";
const names = () => JSON.stringify([...new Set(Base.descendants.map((k) => k.name))].sort());
Trails.application!.routes().draw(function () {
  this.get("/load", {
    to: async () => {
      await (constGet(TopLevel, "Post") as typeof Base).all().toArray();
      return [200, {}, [names()]];
    },
  });
  this.get("/unload", { to: async () => [200, {}, [names()]] });
});`,
    );

    await t.bootTrails();
    await setupArBang();

    const initial = [
      "ActiveStorage::Record",
      "ActiveStorage::Blob",
      "ActiveStorage::Attachment",
      "ApplicationRecord",
    ].sort();

    expect([...new Set(Base.descendants.map((k) => k.name))].sort()).toEqual(initial);
    await t.get("/load");
    expect(t.lastResponse().status).toBe(200);
    expect(
      (JSON.parse(t.lastResponse().body) as string[]).filter((n) => !initial.includes(n)),
    ).toEqual(["Post"]);
    await t.get("/unload");
    expect(t.lastResponse().status).toBe(200);
    expect(
      (JSON.parse(t.lastResponse().body) as string[]).filter((n) => !initial.includes(n)),
    ).toEqual([]);
  });

  // BLOCKED: trailties-tests-broken-while-shards-ran-zero
  it.skip("columns migrations also trigger reloading", async () => {
    await t.addToConfig(`this.config.enableReloading = true;
    this.config.activeRecord.timestampedMigrations = false;`);

    await t.appFile(
      "config/routes.ts",
      `import { Trails } from "@blazetrails/trailties";
import { constGet, TopLevel } from "@blazetrails/ruby-compat";
type PostClass = new () => { title: string; body: string };
Trails.application!.routes().draw(function () {
  this.get("/title", {
    to: async () => [200, { "Content-Type": "text/plain" }, [new (constGet(TopLevel, "Post") as PostClass)().title]],
  });
  this.get("/body", {
    to: async () => [200, { "Content-Type": "text/plain" }, [new (constGet(TopLevel, "Post") as PostClass)().body]],
  });
});`,
    );

    await t.appFile(
      "app/models/post.ts",
      `import { Base } from "@blazetrails/activerecord";
export class Post extends Base {}`,
    );

    await t.appFile(
      "db/migrate/1_create_posts.ts",
      `import { Migration } from "@blazetrails/activerecord";
export class CreatePosts extends Migration.Current {
  async change() {
    await this.createTable("posts", (t) => {
      t.string("title", { default: "TITLE" });
    });
  }
}`,
    );

    await t.trails("db:migrate");
    await t.bootTrails();

    await t.get("/title");
    expect(t.lastResponse().body).toBe("TITLE");

    await t.appFile(
      "db/migrate/2_add_body_to_posts.ts",
      `import { Migration } from "@blazetrails/activerecord";
export class AddBodyToPosts extends Migration.Current {
  async change() {
    await this.addColumn("posts", "body", "text", { default: "BODY" });
  }
}`,
    );

    await t.trails("db:migrate");

    await t.get("/body");
    expect(t.lastResponse().body).toBe("BODY");
  });
});

async function setupArBang(): Promise<void> {
  await Base.establishConnection();
  Migration.verbose = false;
  await Schema.define({ version: 1 }, async (schema) => {
    await schema.createTable("posts", (t) => {
      t.string("title");
    });
  });
}
