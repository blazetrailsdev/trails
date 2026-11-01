import {
  Dir,
  File,
  FileUtils,
  Process,
  classModule,
  env,
  getFs,
  rbInspect,
  setEnv,
} from "@blazetrails/ruby-compat";
import { Application } from "../../application.js";
import { AppGenerator } from "../../generators/rails/app/app-generator.js";
import { Trails } from "../../rails.js";

export const TRAILS_FRAMEWORK_ROOT = File.expandPath(
  decodeURIComponent(new URL("../../../../..", import.meta.url).pathname),
);

async function puts(file: string, string: string, mode: "w" | "a" = "w"): Promise<void> {
  const fs = getFs();
  const prior = mode === "a" && (await fs.exists(file)) ? await fs.readFile(file, "utf-8") : "";
  await fs.writeFile!(file, prior + (string.endsWith("\n") ? string : `${string}\n`));
}

export class Paths {
  static readonly [classModule] = true;
  declare _tmpPath: string | undefined;

  appTemplatePath(): string {
    return File.join(TRAILS_FRAMEWORK_ROOT, "tmp/templates/app_template");
  }

  bootsnapCachePath(): string {
    return File.join(TRAILS_FRAMEWORK_ROOT, "tmp/templates/bootsnap");
  }

  async tmpPath(...args: string[]): Promise<string> {
    const fs = getFs();
    this._tmpPath ??= await fs.realpath!(
      await fs.mkdtemp!(`${File.join(TRAILS_FRAMEWORK_ROOT, "tmp")}/d`),
    );
    return File.join(this._tmpPath, ...args);
  }

  async appPath(): Promise<string>;
  async appPath(...args: string[]): Promise<string>;
  async appPath<T>(...args: [...string[], (path: string) => T]): Promise<T>;
  async appPath(...args: unknown[]): Promise<unknown> {
    const block = typeof args.at(-1) === "function" ? (args.pop() as (p: string) => unknown) : null;
    const path = await this.tmpPath(...["app", ...(args as string[])]);
    if (block != null) {
      return block(path);
    } else {
      return path;
    }
  }

  frameworkPath(): string {
    return TRAILS_FRAMEWORK_ROOT;
  }

  trailsRoot(): Promise<string> {
    return this.appPath();
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

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type
export interface Generation extends Paths {}
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

    this._prevTrailsEnv = env["TRAILS_ENV"];
    setEnv("TRAILS_ENV", "development");

    const appPath = await this.appPath();
    await FileUtils.rmRfAsync(appPath);
    await FileUtils.cpRAsync(this.appTemplatePath(), appPath);

    if (!options.initializers) {
      for (const initializer of await Dir.globAsync(`${appPath}/config/initializers/**/*.ts`)) {
        await fs.unlink!(initializer);
      }
    }

    const routes = await fs.readFile(`${appPath}/config/routes.ts`, "utf-8");
    const match = /(\n\s*\}\);\s*)$/.exec(routes);
    if (match) {
      await puts(
        `${appPath}/config/routes.ts`,
        `import { ActionDispatch } from "@blazetrails/actionpack";\n` +
          routes.slice(0, match.index) +
          `\nActionDispatch.deprecator.silence(() => this.match(":controller(/:action(/:id))(.:format)", { via: "all" }));\n` +
          match[1],
      );
    }

    if (options.multiDb) {
      await puts(`${appPath}/config/database.ts`, this.multiDbDatabaseConfigs());
    } else {
      await puts(`${appPath}/config/database.ts`, this.defaultDatabaseConfigs());
    }

    await this.addToConfig(`
        this.config.hosts.push(() => true);
        this.config.eagerLoad = false;
        this.config.sessionStore(":cookie_store", { key: "_myapp_session" });
        this.config.cacheStore = ":mem_cache_store";
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

    const app = (await fs.readFile(`${appPath}/config/application.ts`, "utf-8")).split("\n");
    app.splice(4, 0, `import ${rbInspect(`${dir}/lib/${name}.ts`)};`);

    await fs.writeFile!(`${appPath}/config/application.ts`, app.join("\n"));

    const bukkit = new Bukkit(dir);
    if (block != null) await block(bukkit);
    return bukkit;
  }

  async addToTopOfConfig(str: string): Promise<void> {
    const appPath = await this.appPath();
    const environment = await getFs().readFile(`${appPath}/config/application.ts`, "utf-8");
    const match = /(extends Application \{\s*static \{\s*)/.exec(environment);
    if (match) {
      await puts(
        `${appPath}/config/application.ts`,
        environment.slice(0, match.index) +
          match[1] +
          `\n${str}\n` +
          environment.slice(match.index + match[0].length),
      );
    }
  }

  async addToConfig(str: string): Promise<void> {
    const appPath = await this.appPath();
    const environment = await getFs().readFile(`${appPath}/config/application.ts`, "utf-8");
    const match = /(\n\s*\}\n(?:\s*\/\/.*\n)*\}\n\nApplication\.register[\s\S]*)$/.exec(
      environment,
    );
    if (match) {
      await puts(
        `${appPath}/config/application.ts`,
        environment.slice(0, match.index) + `\n${str}\n` + match[1],
      );
    }
  }

  async addToEnvConfig(env: string, str: string): Promise<void> {
    const file = `${await this.appPath()}/config/environments/${env}.ts`;
    const environment = await getFs().readFile(file, "utf-8");
    const match = /(\n\s*\}\);\s*)$/.exec(environment);
    if (match) {
      await puts(file, environment.slice(0, match.index) + `\n${str}\n` + match[1]);
    }
  }

  async removeFromConfig(str: string): Promise<void> {
    await this.removeFromFile(`${await this.appPath()}/config/application.ts`, str);
  }

  async removeFromEnvConfig(env: string, str: string): Promise<void> {
    await this.removeFromFile(`${await this.appPath()}/config/environments/${env}.ts`, str);
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
    return this.appFile(`app/controllers/${name}-controller.ts`, contents);
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
        `${await this.appPath()}/config/database.ts`,
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
        `${await this.appPath()}/config/database.ts`,
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
        `${await this.appPath()}/config/database.ts`,
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
        `${await this.appPath()}/config/database.ts`,
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

export const TestHelpers = { Paths, Generation };

export default async function setup(): Promise<void> {
  if (env["ISOLATION_TEST"] != null) return;

  const appTemplatePath = Paths.prototype.appTemplatePath();

  await FileUtils.rmRfAsync(appTemplatePath);
  await FileUtils.mkdirPAsync(appTemplatePath);

  const pwd = Dir.pwd();
  try {
    await new AppGenerator(
      [File.basename(appTemplatePath)],
      { skipBundle: true, quiet: true },
      { destinationRoot: File.dirname(appTemplatePath) },
    ).invokeAll();
  } finally {
    Dir.chdir(pwd);
  }
  await puts(`${appTemplatePath}/config/boot.ts`, `import "@blazetrails/trailties/all";`);

  await FileUtils.mkdirPAsync(`${appTemplatePath}/app/javascript`);
  await getFs().writeFile!(`${appTemplatePath}/app/javascript/application.js`, "\n");
}
