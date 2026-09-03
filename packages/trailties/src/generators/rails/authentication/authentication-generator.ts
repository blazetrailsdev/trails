import { File } from "@blazetrails/ruby-compat";
import { GeneratorBase, type GeneratorOptions } from "../../base.js";
import { MigrationGenerator } from "../../migration-generator.js";
import { TEMPLATES } from "./templates.js";

export interface AuthenticationRunOptions {
  api?: boolean;
  skipMailer?: boolean;
  skipActionCable?: boolean;
}

export class AuthenticationGenerator extends GeneratorBase {
  constructor(options: GeneratorOptions) {
    super(options);
  }

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
    src = imp + src.slice(0, at) + mixin + src.slice(at);
    File.write(full, src);
  }

  private configureAuthenticationRoutes(): void {
    for (const f of ["config/routes.ts", "config/routes.js"]) {
      if (!this.fileExists(f)) continue;
      const src = File.read(File.join(this.cwd, f));
      const lines: string[] = [];
      if (!src.includes('router.resources("passwords"'))
        lines.push(`  router.resources("passwords", { param: "token" });`);
      if (!src.includes('router.resource("session")')) lines.push(`  router.resource("session");`);
      if (lines.length) this.insertIntoFile(f, "// routes", lines.join("\n") + "\n");
      return;
    }
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

  private addMigrations(): void {
    this.generate(
      "migration CreateUsers email_address:string!:uniq password_digest:string! --force",
    );
    this.generate(
      "migration CreateSessions user:references ip_address:string user_agent:string --force",
    );
    this.runPendingGenerators();
  }

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
