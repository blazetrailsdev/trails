import { afterEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import ts from "typescript-5";
import { TopLevel, rbFLoad } from "@blazetrails/ruby-compat";
import { buildViews } from "../lib/build-views.js";

type Seats = Record<string, unknown>;
const seats = TopLevel as unknown as Seats;
const global = globalThis as unknown as Seats;

function scratchApp(): string {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "trails-tsc-init-"));
  const write = (rel: string, body: string) => {
    fs.mkdirSync(path.dirname(path.join(cwd, rel)), { recursive: true });
    fs.writeFileSync(path.join(cwd, rel), body);
  };
  write("app/views/audits/show.html.tse", "audit");
  write(
    "app/models/audit.js",
    'export class Audit extends globalThis.TrailsTscBase { static { this.hasOneAttached("report"); } }\n',
  );
  write(
    "config/initializers/hub-database.js",
    'import { Audit } from "../../app/models/audit.js";\nglobalThis.TrailsTscAudit = Audit;\n',
  );
  return cwd;
}

function application(cwd: string, initialized: boolean, helperNames: string[] = []) {
  const ran: string[] = [];
  const app = {
    _initialized: initialized,
    config: { root: cwd },
    initialized: () => app._initialized,
    async initializeBang() {
      ran.push("active_storage.attached");
      (global.TrailsTscBase as Seats).hasOneAttached = (name: string) => ran.push(name);
      ran.push("load_config_initializers");
      await rbFLoad(path.join(cwd, "config/initializers/hub-database.js"));
      app._initialized = true;
      return app;
    },
    reloadRoutesUnlessLoaded: async () => true,
    routes: () => ({ namedRoutes: { helperNames: () => helperNames } }),
  };
  return { app, ran };
}

describe("buildViews initializers", () => {
  afterEach(() => {
    delete seats.Trails;
    delete global.TrailsTscBase;
    delete global.TrailsTscAudit;
  });

  it("loads config/initializers after the engine initializers by initializing the application", async () => {
    const cwd = scratchApp();
    global.TrailsTscBase = class {};
    const { app, ran } = application(cwd, false);
    seats.Trails = { application: app };

    const { files } = await buildViews({ cwd });

    expect(files).toEqual(["audits/show.html.tse"]);
    expect(ran).toEqual(["active_storage.attached", "load_config_initializers", "report"]);
    expect(app.initialized()).toBe(true);
    expect(global.TrailsTscAudit).toBeDefined();
  }, 30_000);

  it("does not initialize an application that is already initialized", async () => {
    const cwd = scratchApp();
    global.TrailsTscBase = class {};
    const { app, ran } = application(cwd, true);
    seats.Trails = { application: app };

    await buildViews({ cwd });

    expect(ran).toEqual([]);
    expect(global.TrailsTscAudit).toBeUndefined();
  }, 30_000);

  it("types a view's route helpers from the drawn named routes", async () => {
    const cwd = scratchApp();
    const write = (rel: string, body: string) => {
      fs.mkdirSync(path.dirname(path.join(cwd, rel)), { recursive: true });
      fs.writeFileSync(path.join(cwd, rel), body);
    };
    write(
      "node_modules/@blazetrails/actionview/package.json",
      '{ "name": "@blazetrails/actionview", "types": "index.d.ts" }',
    );
    write(
      "node_modules/@blazetrails/actionview/index.d.ts",
      "export interface TemplateRegistry {}\nexport type TemplateLocals<T> = T;\nexport declare class Base { render(...args: unknown[]): string; }\nexport declare const TopLevel: {};\nexport interface ConstantTable {}\nexport type ControllerDelegate = never;",
    );
    write("app/views/audits/show.html.tse", "<%= this.auditsPath() %><%= this.reportsPath() %>");
    global.TrailsTscBase = class {};
    const { app } = application(cwd, true, ["auditsPath", "auditsUrl"]);
    seats.Trails = { application: app };

    await buildViews({ cwd });

    const shim = path.join(cwd, ".trails/views/audits/show.html.tse.ts");
    expect(fs.readFileSync(shim, "utf8")).not.toContain("`${string}Path`");
    const program = ts.createProgram([shim], {
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ESNext,
    });
    const codes = ts
      .getPreEmitDiagnostics(program)
      .filter((d) => d.file?.fileName === shim)
      .map((d) => `${d.code} ${ts.flattenDiagnosticMessageText(d.messageText, "\n")}`);
    expect(codes).toHaveLength(1);
    expect(codes[0]).toMatch(/^2339 Property 'reportsPath' does not exist/);
  }, 30_000);
});
