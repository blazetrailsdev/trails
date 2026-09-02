import { GeneratorBase, type GeneratorOptions } from "../../base.js";
import { MigrationGenerator } from "../../migration-generator.js";
import { TEMPLATES } from "./templates.js";

export interface AuthenticationRunOptions {
  api?: boolean;
  skipMailer?: boolean;
  skipActionCable?: boolean;
}

// Mirrors railties/lib/rails/generators/rails/authentication/authentication_generator.rb.
export class AuthenticationGenerator extends GeneratorBase {
  constructor(options: GeneratorOptions) {
    super(options);
  }

  /**
   * `run` takes an options object, so the generic `start` would hand it the
   * name string. Rails fills it from `class_option :api`
   * (`authentication_generator.rb:6-7`) — story
   * `wire-generator-class-options-through-trails-generate`.
   */
  static override async start(args: string[], config: GeneratorOptions): Promise<string[]> {
    const generator = new AuthenticationGenerator(config);
    generator.run({});
    return generator.getCreatedFiles();
  }

  run(options: AuthenticationRunOptions = {}): string[] {
    if (!this.isTypeScript())
      throw new Error("AuthenticationGenerator currently emits TypeScript only.");
    this.createAuthenticationFiles(options);
    this.configureApplicationController();
    this.configureAuthenticationRoutes();
    this.enableBcrypt();
    this.addMigrations();
    return this.getCreatedFiles();
  }

  /** `authentication_generator.rb:14-30`. */
  private createAuthenticationFiles(options: AuthenticationRunOptions): void {
    const { api = false, skipMailer = false, skipActionCable = true } = options;

    this.template("app/models/session.rb");
    this.template("app/models/user.rb");
    this.template("app/models/current.rb");

    this.template("app/controllers/sessions_controller.rb");
    this.template("app/controllers/concerns/authentication.rb");
    this.template("app/controllers/passwords_controller.rb");

    if (!skipActionCable) this.template("app/channels/application_cable/connection.rb");

    if (!skipMailer) {
      this.template("app/mailers/passwords_mailer.rb");
      if (!api) {
        this.template("app/views/passwords_mailer/reset.html.erb");
        this.template("app/views/passwords_mailer/reset.text.erb");
      }
      this.template("test/mailers/previews/passwords_mailer_preview.rb");
    }
  }

  /**
   * Rails' `template` asks on a conflict; trails' generators are
   * non-interactive, so an existing file is left alone and reported.
   */
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

  /** `authentication_generator.rb:32-34`. Anchored on the class declaration. */
  private configureApplicationController(): void {
    const file = "app/controllers/application-controller.ts";
    if (!this.fileExists(file)) return;
    const full = this.path.join(this.cwd, file);
    let src = this.fs.readFileSync(full, "utf-8");
    const mixin = src.includes("include(this, Authentication)") ? "" : STATIC_INIT;
    const hasAuth = /import\s*\{[^}]*\bAuthentication\b[^}]*\}\s*from\s*["'][^"']+["']/.test(src);
    const hasInclude = /import\s*\{[^}]*\binclude\b[^}]*\}\s*from\s*["'][^"']+["']/.test(src);
    const imp = (hasInclude ? "" : INCLUDE_IMPORT) + (hasAuth ? "" : AUTH_IMPORT);
    if (!mixin && !imp) return;
    const m = src.match(/export\s+class\s+ApplicationController\b[^{]*\{/);
    if (!m || m.index === undefined) return;
    const at = m.index + m[0].length;
    src = imp + src.slice(0, at) + mixin + src.slice(at);
    this.fs.writeFileSync(full, src);
  }

  /**
   * `authentication_generator.rb:36-39`. Each route is checked independently
   * so a partly-configured routes file converges.
   */
  private configureAuthenticationRoutes(): void {
    for (const f of ["config/routes.ts", "config/routes.js"]) {
      if (!this.fileExists(f)) continue;
      const src = this.fs.readFileSync(this.path.join(this.cwd, f), "utf-8");
      const lines: string[] = [];
      if (!src.includes('router.resources("passwords"'))
        lines.push(`  router.resources("passwords", { param: "token" });`);
      if (!src.includes('router.resource("session")')) lines.push(`  router.resource("session");`);
      if (lines.length) this.insertIntoFile(f, "// routes", lines.join("\n") + "\n");
      return;
    }
  }

  /**
   * `authentication_generator.rb:41-47`. Rails' Gemfile arm has no analogue.
   *
   * @missingRailsCall execute_command — CONVERGEABLE port-execute-command-as-a-generator-action
   */
  private enableBcrypt(): void {
    if (!this.fileExists("package.json")) return;
    const full = this.path.join(this.cwd, "package.json");
    const json = JSON.parse(this.fs.readFileSync(full, "utf-8"));
    if (json.dependencies?.["bcryptjs"]) return;
    json.dependencies = { ...json.dependencies, bcryptjs: "*" };
    this.fs.writeFileSync(full, JSON.stringify(json, null, 2) + "\n");
  }

  /** `authentication_generator.rb:52-55`. */
  private addMigrations(): void {
    this.generate(
      "migration CreateUsers email_address:string!:uniq password_digest:string! --force",
    );
    this.generate(
      "migration CreateSessions user:references ip_address:string user_agent:string --force",
    );
    this.runPendingGenerators();
  }

  /**
   * Rails' `generate` shells out, so the migrations exist when it returns;
   * trails' only queues (`generators/actions.ts:22-29`). Converges with story
   * `drain-queued-generators-in-generators-invoke`.
   */
  private runPendingGenerators(): void {
    for (const { what, args } of this.pendingGenerators.splice(0)) {
      const words = [...what.split(/\s+/), ...args].filter(Boolean);
      if (words.shift() !== "migration") continue;
      const generator = new MigrationGenerator({ cwd: this.cwd, output: this.output });
      for (const file of generator.run(words[0], words.slice(1))) this.createdFiles.push(file);
    }
  }
}

const INCLUDE_IMPORT = `import { include } from "@blazetrails/activesupport";\n`;
const AUTH_IMPORT = `import { Authentication } from "./concerns/authentication.js";\n`;
const STATIC_INIT = `\n  static {\n    include(this, Authentication);\n  }`;
