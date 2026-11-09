import {
  Dir,
  File,
  FileUtils,
  Process,
  RuntimeError,
  Shellwords,
  classModule,
  env as ENV,
  extend,
  include,
  getFs,
  rbFArray,
  rbFBackquote,
  rbInspect,
  setEnv,
} from "@blazetrails/ruby-compat";
import { Dependencies, Stream } from "@blazetrails/activesupport";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { MockRequest } from "@blazetrails/rack";
import { ConnectionAdapters } from "@blazetrails/activerecord";
import { YAML } from "@blazetrails/ruby-compat/yaml";
import { Application } from "../../../lib/application.js";
import type { EnvHelpers } from "../env-helpers.js";
import { Trails } from "../../../lib/trails.js";
import { Paths, TRAILS_FRAMEWORK_ROOT } from "./paths.js";

export { Paths, TRAILS_FRAMEWORK_ROOT };

type RackResponse = [number, Record<string, string>, AsyncIterable<string> | Iterable<string>];
interface RackHost {
  call(env: Record<string, unknown>): Promise<RackResponse>;
}

async function puts(file: string, string: string, mode: "w" | "a" = "w"): Promise<void> {
  const fs = getFs();
  const prior = mode === "a" && (await fs.exists(file)) ? await fs.readFile(file, "utf-8") : "";
  await fs.writeFile!(file, prior + (string.endsWith("\n") ? string : `${string}\n`));
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Rack extends Paths {
  assert(test: unknown): void;
  assertEqual(expected: unknown, actual: unknown): void;
  assertMatch(matcher: string | RegExp, obj: string): void;
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Rack {
  static readonly [classModule] = true;
  declare _app: RackHost | undefined;

  app(env = "production"): RackHost | Promise<RackHost> {
    if (this._app != null) return this._app;
    return (async () => {
      const oldEnv = ENV["TRAILS_ENV"];
      try {
        setEnv("TRAILS_ENV", env);

        const environment = await this.appPath("config", "environment.ts");
        await import(environment);

        return (this._app = Trails.application as unknown as RackHost);
      } finally {
        setEnv("TRAILS_ENV", oldEnv);
      }
    })();
  }

  async extractBody(response: RackResponse): Promise<string> {
    let body = "";
    for await (const chunk of response[2]) body += chunk;
    return body;
  }

  get(path: string): Promise<RackResponse> {
    return this._app!.call(MockRequest.envFor(path));
  }

  async assertWelcome(resp: RackResponse): Promise<void> {
    resp = rbFArray(resp) as RackResponse;

    this.assertEqual(200, resp[0]);
    this.assertMatch("text/html", resp[1]["Content-Type"]);
    this.assertMatch("charset=utf-8", resp[1]["Content-Type"]);
    this.assert(/Trails version:/.test(await this.extractBody(resp)));
  }
}

export class Bukkit {
  path: string;

  constructor(path: string) {
    this.path = path;
  }

  async write(file: string, string: string): Promise<void> {
    const path = `${this.path}/${file}`;
    await FileUtils.mkdirPAsync(File.dirname(path));
    await puts(path, string);
  }

  async delete(file: string): Promise<void> {
    await getFs().unlink!(`${this.path}/${file}`);
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Generation extends Paths, EnvHelpers {
  _app: RackHost | undefined;
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Generation {
  static readonly [classModule] = true;
  static readonly Bukkit = Bukkit;
  declare _prevTrailsAppClass: typeof Application.appClass;
  declare _prevTrailsApplication: typeof Trails.application;
  declare _prevTrailsEnv: string | undefined;

  async buildApp(options: { initializers?: boolean; multiDb?: boolean } = {}): Promise<void> {
    const fs = getFs();
    this._prevTrailsAppClass = Application.appClass;
    this._prevTrailsApplication = Trails.application;
    Application.appClass = null;
    Trails.application = null;

    this._prevTrailsEnv = ENV["TRAILS_ENV"];
    setEnv("TRAILS_ENV", "development");

    const appPath = await this.appPath();
    await FileUtils.rmRfAsync(appPath);
    await FileUtils.cpRAsync(this.appTemplatePath(), appPath);

    if (!options.initializers) {
      for (const initializer of await Dir.globAsync(
        File.join(appPath, "config/initializers/**/*.ts"),
      )) {
        await fs.unlink!(initializer);
      }
    }

    const routes = await fs.readFile(File.join(appPath, "config/routes.ts"), "utf-8");
    const match = /(\n\s*\}\);\s*)$/.exec(routes);
    if (match) {
      await puts(
        File.join(appPath, "config/routes.ts"),
        `import { ActionDispatch } from "@blazetrails/actionpack";\n` +
          routes.slice(0, match.index) +
          `\nActionDispatch.deprecator().silence(() => this.match(":controller(/:action(/:id))(.:format)", { via: ":all" }));\n` +
          match[1],
      );
    }

    if (options.multiDb) {
      await puts(File.join(appPath, "config/database.ts"), this.multiDbDatabaseConfigs());
    } else {
      await puts(File.join(appPath, "config/database.ts"), this.defaultDatabaseConfigs());
    }

    await this.addToConfig(`
        this.config.hosts.push(() => true);
        this.config.eagerLoad = false;
        this.config.sessionStore(":cookie_store", { key: "_myapp_session" });
        this.config.cacheStore = ":memory_store";
        this.config.activeSupport.deprecation = "log";
        this.config.actionController.allowForgeryProtection = false;
`);

    await this.addToEnvConfig(
      "development",
      "this.config.actionView.annotateRenderedViewWithFilenames = false;",
    );

    await this.removeFromEnvConfig(
      "development",
      "this\\.config\\.generators\\(\\)\\.applyEslintAutocorrectAfterGenerateBang\\(\\);",
    );
    await this.addToEnvConfig("production", `this.config.logLevel = "error";`);
  }

  async withUnhealthyDatabase<T>(block: () => T | Promise<T>): Promise<T> {
    await import("@blazetrails/activerecord/connection-adapters/sqlite3-adapter.js");

    const dumpPath = File.join(await this.appPath(), "db/schema_cache.yml");
    if (await File.isExistAsync(dumpPath)) {
      const schemaCache = (await ConnectionAdapters.SchemaCache._loadFrom(dumpPath))!;
      Object.assign(schemaCache, {
        _databaseVersion: new ConnectionAdapters.AbstractAdapter.Version("8.8.8"),
      });
      await File.writeAsync(dumpPath, YAML.dump(schemaCache));
    }

    return this.switchEnv("DATABASE_URL", "mysql2://127.0.0.1:1", block);
  }

  async makeBasicApp(block?: (app: typeof Application) => unknown): Promise<void> {
    await import("../../../lib/trailties/action-controller.js");
    await import("../../../lib/trailties/action-view.js");

    const app = class RailtiesTestApp extends Application {};
    this._app = app as unknown as RackHost;
    Application.register(app);
    app.config.hosts.push(() => true);
    app.config.eagerLoad = false;
    app.config.sessionStore(":cookie_store", { key: "_myapp_session" });
    app.config.activeSupport.deprecation = "log";
    app.config.logLevel = "error";
    app.config.secretKeyBase = "b3c631c314c0bbca50c1b2843150fe33";
    app.config.activeSupport.toTimePreservesTimezone = ":zone";

    if (block) await block(app);
    await app.instance().initializeBang();

    app
      .instance()
      .routes()
      .draw(function () {
        this.get("/", { to: "omg#index" });
      });

    const RackTest = await import("@blazetrails/rack-test");
    extend(this, RackTest.Methods);
  }

  async teardownApp(): Promise<void> {
    if (this._prevTrailsEnv != null) setEnv("TRAILS_ENV", this._prevTrailsEnv);
    if (this._prevTrailsAppClass != null) Application.appClass = this._prevTrailsAppClass;
    if (this._prevTrailsApplication != null) Trails.application = this._prevTrailsApplication;
    await FileUtils.rmRfAsync(await this.tmpPath());
  }

  defaultDatabaseConfigs(): string {
    return `
const defaults = { adapter: "sqlite3", pool: 5, timeout: 5000 };
export default {
  development: { ...defaults, database: "storage/development.sqlite3" },
  test: { ...defaults, database: "storage/test.sqlite3" },
  production: { ...defaults, database: "storage/production.sqlite3" },
};
`;
  }

  multiDbDatabaseConfigs(): string {
    return `
const defaults = { adapter: "sqlite3", pool: 5, timeout: 5000, variables: { statement_timeout: 1000 } };
const env = (name) => ({
  primary: { ...defaults, database: \`storage/\${name}.sqlite3\` },
  primary_readonly: { ...defaults, database: \`storage/\${name}.sqlite3\`, replica: true },
  animals: {
    ...defaults,
    database: \`storage/\${name}_animals.sqlite3\`,
    migrationsPaths: "db/animals_migrate",
  },
  animals_readonly: {
    ...defaults,
    database: \`storage/\${name}_animals.sqlite3\`,
    migrationsPaths: "db/animals_migrate",
    replica: true,
  },
});
export default { development: env("development"), test: env("test"), production: env("production") };
`;
  }

  async simpleController(): Promise<void> {
    await this.controller(
      "foo",
      `
        import { ApplicationController } from "./application-controller.ts";
        export class FooController extends ApplicationController {
          index() {
            this.render({ plain: "foo" });
          }
        }
`,
    );

    await this.appFile(
      "config/routes.ts",
      `
        import { Trails } from "@blazetrails/trailties";
        Trails.application.routes().draw(function () {
          this.get(":controller(/:action)");
        });
`,
    );
  }

  /** @missingRailsCall unshift — PERMANENT */
  async engine(name: string, block?: (bukkit: Bukkit) => unknown): Promise<Bukkit> {
    const fs = getFs();
    const appPath = await this.appPath();
    const dir = `${appPath}/random/${name}`;
    await FileUtils.mkdirPAsync(dir);

    const app = (await fs.readFile(File.join(appPath, "config/application.ts"), "utf-8")).split(
      "\n",
    );
    app.splice(4, 0, `import ${rbInspect(File.join(dir, "lib", `${name}.ts`))};`);

    await fs.writeFile!(File.join(appPath, "config/application.ts"), app.join("\n"));

    const bukkit = new Bukkit(dir);
    if (block != null) await block(bukkit);
    return bukkit;
  }

  async bootTrails(): Promise<void> {
    const environment = await this.appPath("config", "environment.ts");
    await import(environment);
  }

  /** @missingRailsCall fork — PERMANENT */
  async trails(
    ...args: (string | unknown[] | { allowFailure?: boolean; stderr?: boolean })[]
  ): Promise<string> {
    const last = args.at(-1);
    const { allowFailure = false, stderr = false } =
      last != null && typeof last === "object" && !Array.isArray(last)
        ? (args.pop() as { allowFailure?: boolean; stderr?: boolean })
        : {};
    const argv = args.flat(Infinity);

    const command = `bin/trails ${Shellwords.join(argv)}${stderr ? "" : " 2>&1"}`;

    let output: string;
    setEnv("BOOTSNAP_CACHE_DIR", this.bootsnapCachePath());
    try {
      output = await rbFBackquote(`cd ${await this.appPath()}; ${command}`);
    } finally {
      setEnv("BOOTSNAP_CACHE_DIR", undefined);
    }

    if (!allowFailure && !Process.lastStatus!.isSuccess()) {
      throw new RuntimeError(
        `trails command failed (${Process.lastStatus!.exitstatus()}): ${command}\n${output}`,
      );
    }

    return output;
  }

  async addToTopOfConfig(str: string): Promise<void> {
    const appPath = await this.appPath();
    const environment = await getFs().readFile(
      File.join(appPath, "config/application.ts"),
      "utf-8",
    );
    const match = /(extends Application \{\s*static \{\s*)/.exec(environment);
    if (match) {
      await puts(
        File.join(appPath, "config/application.ts"),
        environment.slice(0, match.index) +
          match[1] +
          `\n${str}\n` +
          environment.slice(match.index + match[0].length),
      );
    }
  }

  async addToConfig(str: string): Promise<void> {
    const appPath = await this.appPath();
    const environment = await getFs().readFile(
      File.join(appPath, "config/application.ts"),
      "utf-8",
    );
    if (/\bawait\b/.test(str)) {
      const classEnd = /(\n(?:\/\/.*\n)*await [\s\S]*)$/.exec(environment);
      if (classEnd) {
        await puts(
          File.join(appPath, "config/application.ts"),
          environment.slice(0, classEnd.index) + `\n${str}\n` + classEnd[1],
        );
      }
      return;
    }
    const match = /(\n\s*\}\n(?:\s*\/\/.*\n)*}\n\n(?:\/\/.*\n)*await [\s\S]*)$/.exec(environment);
    if (match) {
      await puts(
        File.join(appPath, "config/application.ts"),
        environment.slice(0, match.index) + `\n${str}\n` + match[1],
      );
    }
  }

  async addToEnvConfig(env: string, str: string): Promise<void> {
    const file = File.join(await this.appPath(), "config/environments", `${env}.ts`);
    const environment = await getFs().readFile(file, "utf-8");
    const match = /(\n\s*\}\);\s*)$/.exec(environment);
    if (match) {
      await puts(file, environment.slice(0, match.index) + `\n${str}\n` + match[1]);
    }
  }

  async removeFromConfig(str: string): Promise<void> {
    await this.removeFromFile(File.join(await this.appPath(), "config/application.ts"), str);
  }

  async removeFromEnvConfig(env: string, str: string): Promise<void> {
    await this.removeFromFile(
      File.join(await this.appPath(), "config/environments", `${env}.ts`),
      str,
    );
  }

  async removeFromFile(file: string, str: string): Promise<void> {
    const contents = await getFs().readFile(file, "utf-8");
    await getFs().writeFile!(file, contents.replace(new RegExp(str, "g"), ""));
  }

  async appFile(path: string, contents: string, mode: "w" | "a" = "w"): Promise<string> {
    const fileName = `${await this.appPath()}/${path}`;
    await FileUtils.mkdirPAsync(File.dirname(fileName));
    await puts(fileName, contents, mode);
    return fileName;
  }

  async appDir(path: string): Promise<void> {
    await FileUtils.mkdirPAsync(`${await this.appPath()}/${path}`);
  }

  async removeFile(path: string): Promise<void> {
    await FileUtils.rmRfAsync(`${await this.appPath()}/${path}`);
  }

  controller(name: string, contents: string): Promise<string> {
    return this.appFile(File.join("app/controllers", `${name}-controller.ts`), contents);
  }

  /** @missingRailsCall reject! — PERMANENT */
  async useFrameworks(arr: string[]): Promise<void> {
    const toRemove = [
      "actionmailer",
      "activerecord",
      "activestorage",
      "activejob",
      "actionmailbox",
    ].filter((framework) => !arr.includes(framework));

    if (toRemove.includes("activerecord")) {
      await this.removeFromConfig("this\\.config\\.activeRecord.*");
    }
  }

  async usePostgresql({ multiDb = false }: { multiDb?: boolean } = {}): Promise<string> {
    const databaseName = `railties_${Process.pid}`;
    if (multiDb) {
      await puts(
        File.join(await this.appPath(), "config/database.ts"),
        `const defaults = { adapter: "postgresql", pool: 5 };
export default {
  development: {
    primary: { ...defaults, database: "${databaseName}_test" },
    animals: {
      ...defaults,
      database: "${databaseName}_animals_test",
      migrationsPaths: "db/animals_migrate",
    },
  },
};
`,
      );
    } else {
      await puts(
        File.join(await this.appPath(), "config/database.ts"),
        `const defaults = { adapter: "postgresql", pool: 5 };
export default {
  development: { ...defaults, database: "${databaseName}_development" },
  test: { ...defaults, database: "${databaseName}_test" },
};
`,
      );
    }
    return databaseName;
  }

  async useMysql2({ multiDb = false }: { multiDb?: boolean } = {}): Promise<string> {
    const databaseName = `railties_${Process.pid}`;
    if (multiDb) {
      await puts(
        File.join(await this.appPath(), "config/database.ts"),
        `import { env } from "@blazetrails/ruby-compat";
const defaults = {
  adapter: "mysql2",
  pool: 5,
  username: "root",
  ...(env.MYSQL_HOST != null ? { host: env.MYSQL_HOST } : {}),
  ...(env.MYSQL_SOCK != null ? { socket: env.MYSQL_SOCK } : {}),
};
export default {
  development: {
    primary: { ...defaults, database: "${databaseName}_test" },
    animals: {
      ...defaults,
      database: "${databaseName}_animals_test",
      migrationsPaths: "db/animals_migrate",
    },
  },
};
`,
      );
    } else {
      await puts(
        File.join(await this.appPath(), "config/database.ts"),
        `import { env } from "@blazetrails/ruby-compat";
const defaults = {
  adapter: "mysql2",
  pool: 5,
  username: "root",
  ...(env.MYSQL_HOST != null ? { host: env.MYSQL_HOST } : {}),
  ...(env.MYSQL_SOCK != null ? { socket: env.MYSQL_SOCK } : {}),
};
export default {
  development: { ...defaults, database: "${databaseName}_development" },
  test: { ...defaults, database: "${databaseName}_test" },
};
`,
      );
    }
    return databaseName;
  }
}

export class Reload {
  static readonly [classModule] = true;

  reload(): Promise<void> {
    return Dependencies.clear();
  }
}

export const TestHelpers = { Paths, Rack, Generation, Reload };

include(TestCase, Paths);
include(TestCase, Rack);
include(TestCase, Generation);
include(TestCase, Reload);
include(TestCase, Stream);

async function withEnv<T>(
  this: TestCase,
  env: Record<string, string>,
  block: () => T | Promise<T>,
): Promise<T> {
  try {
    for (const [k, v] of Object.entries(env)) setEnv(k, v);
    return await block();
  } finally {
    for (const k of Object.keys(env)) setEnv(k, undefined);
  }
}
TestCase.prototype.withEnv = withEnv;

declare module "@blazetrails/activesupport/test-case" {
  interface TestCase {
    withEnv: typeof withEnv;
  }
}
