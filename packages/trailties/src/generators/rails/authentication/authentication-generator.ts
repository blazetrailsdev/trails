import { TopLevel } from "@blazetrails/activesupport";
import { File } from "@blazetrails/ruby-compat";
import { GeneratorBase, type GeneratorOptions } from "../../base.js";
import { MigrationGenerator } from "../../migration-generator.js";
import { AuthenticationGenerator as TseAuthenticationGenerator } from "../../tse/authentication/authentication-generator.js";
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
  }

  constructor(options: AuthenticationGeneratorOptions) {
    super(options);
  }

  async run(): Promise<string[]> {
    if (!this.isTypeScript())
      throw new Error("AuthenticationGenerator currently emits TypeScript only.");
    if (!this.options.api) {
      const templateEngine = new TseAuthenticationGenerator({
        cwd: this.cwd,
        output: this.output,
        behavior: this.behavior,
        pretend: this.options.pretend,
      });
      this.createdFiles.push(...templateEngine.run());
    }
    this.createAuthenticationFiles();
    this.configureApplicationController();
    await this.configureAuthenticationRoutes();
    this.enableBcrypt();
    await this.addMigrations();
    return this.getCreatedFiles();
  }

  private createAuthenticationFiles(): void {
    this.template("app/models/session.rb");
    this.template("app/models/user.rb");
    this.template("app/models/current.rb");

    this.template("app/controllers/sessions_controller.rb");
    this.template("app/controllers/concerns/authentication.rb");
    this.template("app/controllers/passwords_controller.rb");

    if (TopLevel.ActionCable?.Engine !== undefined)
      this.template("app/channels/application_cable/connection.rb");

    this.template("app/mailers/passwords_mailer.rb");

    this.template("app/views/passwords_mailer/reset.html.erb");
    this.template("app/views/passwords_mailer/reset.text.erb");

    this.template("test/mailers/previews/passwords_mailer_preview.rb");
  }

  private template(file: string): void {
    const destination = file
      .replace(/\.rb$/, ".ts")
      .replace(/\.erb$/, ".tse")
      .replace(/[^/]+(?=\/|\.)/g, (segment) => segment.replace(/_/g, "-"));
    if (this.fileExists(destination)) {
      this.output(`      skip  ${destination} (already exists)`);
      return;
    }
    this.createFile(destination, TEMPLATES[file]);
  }

  private configureApplicationController(): void {
    const file = "app/controllers/application-controller.ts";
    if (!this.fileExists(file)) return;
    const full = File.join(this.cwd, file);
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
  private async configureAuthenticationRoutes(): Promise<void> {
    await this.route(`mapper.resources("passwords", { param: "token" });`);
    await this.route(`mapper.resource("session");`);
  }

  private enableBcrypt(): void {
    if (!this.fileExists("package.json")) return;
    const full = File.join(this.cwd, "package.json");
    const json = JSON.parse(File.read(full));
    if (!json.dependencies?.["bcryptjs"]) {
      json.dependencies = { ...json.dependencies, bcryptjs: "*" };
      File.write(full, JSON.stringify(json, null, 2) + "\n");
    }
    this.executeCommand(json.packageManager?.split("@")[0] ?? "pnpm", "install --silent");
  }

  private async addMigrations(): Promise<void> {
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
      this.createdFiles.push(
        ...(await MigrationGenerator.start(words, {
          cwd: this.cwd,
          output: this.output,
          behavior: this.behavior,
          pretend: this.options.pretend,
        })),
      );
    }
  }
}

const INCLUDE_IMPORT = `import { include, type Extended, type Included } from "@blazetrails/activesupport";\n`;
const AUTH_IMPORT = `import { Authentication, type ClassMethods } from "./concerns/authentication.js";\n`;
const INCLUDED_SURFACE = `export interface ApplicationController extends Included<typeof Authentication> {}\n\n`;
const STATIC_INIT =
  `\n  declare static allowUnauthenticatedAccess: Extended<typeof ClassMethods>["allowUnauthenticatedAccess"];\n` +
  `\n  static {\n    include(this, Authentication);\n  }`;
