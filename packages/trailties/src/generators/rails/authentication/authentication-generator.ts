import { TopLevel } from "@blazetrails/activesupport";
import { File } from "@blazetrails/ruby-compat";
import { run, type ActionsHost as ThorActionsHost } from "@blazetrails/thor/actions";
import { GeneratorBase, type GeneratorOptions, type GeneratorConfig } from "../../base.js";
import { MigrationGenerator } from "../../active-record/migration/migration-generator.js";
import type { GeneratorClass } from "../../../generators.js";
import { TEMPLATES } from "./templates.js";

export interface AuthenticationGeneratorOptions extends GeneratorOptions {
  api?: boolean;
}

export class AuthenticationGenerator extends GeneratorBase {
  declare options: AuthenticationGeneratorOptions;

  static {
    this.classOption("api", {
      type: "boolean",
      desc: "Generate API-only controllers and models, with no view templates",
    });

    this.hookFor(
      "templateEngine",
      { as: "authentication" },
      function (this: GeneratorBase, templateEngine: GeneratorClass) {
        if (!(this.options as AuthenticationGeneratorOptions).api)
          return this.invoke(templateEngine);
      },
    );

    this.methodAdded("createAuthenticationFiles");
    this.methodAdded("configureApplicationController");
    this.methodAdded("configureAuthenticationRoutes");
    this.methodAdded("enableBcrypt");
    this.methodAdded("addMigrations");
    this.noCommands(() => this.methodAdded("template"));
  }

  constructor(args: unknown[] = [], localOptions: unknown = {}, config: GeneratorConfig = {}) {
    super(args, localOptions, config);
    if (!this.isTypeScript())
      throw new Error("AuthenticationGenerator currently emits TypeScript only.");
  }

  async createAuthenticationFiles(): Promise<void> {
    await this.template("app/models/session.rb");
    await this.template("app/models/user.rb");
    await this.template("app/models/current.rb");

    await this.template("app/controllers/sessions_controller.rb");
    await this.template("app/controllers/concerns/authentication.rb");
    await this.template("app/controllers/passwords_controller.rb");

    if (TopLevel.ActionCable?.Engine !== undefined)
      await this.template("app/channels/application_cable/connection.rb");

    await this.template("app/mailers/passwords_mailer.rb");

    await this.template("app/views/passwords_mailer/reset.html.erb");
    await this.template("app/views/passwords_mailer/reset.text.erb");

    await this.template("test/mailers/previews/passwords_mailer_preview.rb");
  }

  override async template(file: string): Promise<void> {
    const destination = file
      .replace(/\.rb$/, ".ts")
      .replace(/\.erb$/, ".tse")
      .replace(/[^/]+(?=\/|\.)/g, (segment) => segment.replace(/_/g, "-"));
    if (File.isExist(File.join(this.destinationRoot, destination))) {
      this.sayStatus("skip", `${destination} (already exists)`);
      return;
    }
    await this.createFile(destination, TEMPLATES[file]);
  }

  configureApplicationController(): void {
    const file = "app/controllers/application-controller.ts";
    if (!File.isExist(File.join(this.destinationRoot, file))) return;
    const full = File.join(this.destinationRoot, file);
    let src = File.read(full);
    const mixin = src.includes("include(this, Authentication)") ? "" : STATIC_INIT;
    const hasAuth = /import\s*\{[^}]*\bAuthentication\b[^}]*\}\s*from\s*["'][^"']+["']/.test(src);
    const hasInclude = /import\s*\{[^}]*\binclude\b[^}]*\}\s*from\s*["'][^"']+["']/.test(src);
    const imp = (hasInclude ? "" : INCLUDE_IMPORT) + (hasAuth ? "" : AUTH_IMPORT);
    if (!mixin && !imp) return;
    const m = src.match(/export\s+class\s+ApplicationController\b[^{]*\{/);
    if (!m || m.index === undefined) return;
    const at = m.index + m[0].length;
    const surface = mixin ? INCLUDED_SURFACE : "";
    src = imp + src.slice(0, m.index) + surface + src.slice(m.index, at) + mixin + src.slice(at);
    File.write(full, src);
  }

  /** @missingRailsArgs route — PERMANENT */
  async configureAuthenticationRoutes(): Promise<void> {
    await this.route(`this.resources("passwords", { param: "token" });`);
    await this.route(`this.resource("session");`);
  }

  /** @missingRailsCall execute_command — CONVERGEABLE converge-generators-actions-generate-onto-rails-command */
  async enableBcrypt(): Promise<void> {
    if (!File.isExist(File.join(this.destinationRoot, "package.json"))) return;
    const full = File.join(this.destinationRoot, "package.json");
    const json = JSON.parse(File.read(full));
    if (!json.dependencies?.["bcryptjs"] || !json.dependencies?.["@blazetrails/bcrypt"]) {
      json.dependencies = { ...json.dependencies, bcryptjs: "*", "@blazetrails/bcrypt": "*" };
      File.write(full, JSON.stringify(json, null, 2) + "\n");
    }
    const command = `${json.packageManager?.split("@")[0] ?? "pnpm"} install --silent`;
    await this.inRoot(() =>
      run.call(this as unknown as ThorActionsHost, command, { verbose: false }),
    );

    const application = "config/application.ts";
    if (!File.isExist(File.join(this.destinationRoot, application))) return;
    const appFull = File.join(this.destinationRoot, application);
    const src = File.read(appFull);
    if (src.includes(BCRYPT_IMPORT)) return;
    const frameworks = 'import "@blazetrails/trailties/all";\n';
    File.write(
      appFull,
      src.includes(frameworks)
        ? src.replace(frameworks, frameworks + BCRYPT_IMPORT)
        : BCRYPT_IMPORT + src,
    );
  }

  async addMigrations(): Promise<void> {
    this.generate(
      "migration CreateUsers email_address:string!:uniq password_digest:string! --force",
    );
    this.generate(
      "migration CreateSessions user:references ip_address:string user_agent:string --force",
    );
    await this.runPendingGenerators();
  }

  private async runPendingGenerators(): Promise<void> {
    for (const { what, args } of this.pendingGenerators.splice(0)) {
      const [namespace, ...words] = [...what.split(/\s+/), ...args].filter(Boolean);
      if (namespace !== "migration") continue;
      await MigrationGenerator.start(words, {
        destinationRoot: this.destinationRoot,
        shell: this.shell,
        behavior: this.behavior,
      });
    }
  }
}

const BCRYPT_IMPORT = `import "@blazetrails/bcrypt";\n`;
const INCLUDE_IMPORT = `import { include, type Extended, type Included } from "@blazetrails/activesupport";\n`;
const AUTH_IMPORT = `import { Authentication, type ClassMethods } from "./concerns/authentication.ts";\n`;
const INCLUDED_SURFACE = `export interface ApplicationController extends Included<typeof Authentication> {}\n\n`;
const STATIC_INIT =
  `\n  declare static allowUnauthenticatedAccess: Extended<typeof ClassMethods>["allowUnauthenticatedAccess"];\n` +
  `\n  static {\n    include(this, Authentication);\n  }`;
