import { afterEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
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

function application(cwd: string, initialized: boolean) {
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
    routes: () => ({ namedRoutes: { helperNames: () => [] } }),
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
});
