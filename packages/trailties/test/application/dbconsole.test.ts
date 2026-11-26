import { afterEach, beforeEach, describe, it } from "vitest";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { Isolation } from "@blazetrails/activesupport/testing/isolation";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { File } from "@blazetrails/ruby-compat/file";
import { include } from "@blazetrails/ruby-compat/include";
import { rbFBackquote } from "@blazetrails/ruby-compat/kernel-system";
import { env as ENV } from "@blazetrails/ruby-compat/process-adapter";
import { StringIO } from "@blazetrails/ruby-compat/string-io";
import { Application } from "../../lib/application.js";
import { Trails } from "../../lib/trails.js";
import { assertOutput } from "../support/console-helpers.js";
import type { Generation } from "../support/isolation/abstract-unit.js";
import "../support/isolation/abstract-unit.js";

class DBConsoleTest extends TestCase {}
include(DBConsoleTest, Isolation);
registerSpecType(/^ApplicationTests::DBConsoleTest$/, DBConsoleTest);

describe("ApplicationTests::DBConsoleTest", { timeout: 300_000 }, () => {
  let t: Generation;

  beforeEach(async () => {
    t = new DBConsoleTest("test") as unknown as Generation;
    await t.buildApp();
  });

  afterEach(async () => {
    await t.teardownApp();
    Trails.application = null;
    Application.appClass = null;
  });

  async function spawnDbconsole(input: string, options: string | null = null): Promise<StringIO> {
    const appPath = await t.appPath();
    const shim = File.join(appPath, "tmp/pty");
    await t.appFile(
      "tmp/pty/sqlite3",
      `#!/bin/sh\nPATH='${ENV.PATH}' exec sqlite3 -interactive "$@"\n`,
    );
    const output = await rbFBackquote(
      `chmod +x ${shim}/sqlite3; cd ${appPath}; printf '${input}' | PATH='${shim}:${ENV.PATH}' bin/trails dbconsole ${options ?? ""} 2>&1`,
    );
    return new StringIO(output);
  }

  it("use value defined in environment file in database yml", async () => {
    await t.appFile(
      "config/database.ts",
      `
import { env as ENV } from "@blazetrails/ruby-compat";
import { Trails } from "@blazetrails/trailties";
export default {
  development: {
    database: Trails.application!.config.database,
    adapter: "sqlite3",
    pool: Object.hasOwn(ENV, "TRAILS_MAX_THREADS") ? ENV.TRAILS_MAX_THREADS : 5,
    timeout: 5000,
  },
};
`,
    );

    await t.appFile(
      "config/environments/development.ts",
      `
import { Trails } from "@blazetrails/trailties";
Trails.application.configure(function () {
  this.config.database = "storage/development.sqlite3";
});
`,
    );

    const primary = await spawnDbconsole(".exit\\n");
    assertOutput("sqlite>", primary, 100);
  });

  it("respect environment option", async () => {
    await t.appFile(
      "config/database.ts",
      `
import { env as ENV } from "@blazetrails/ruby-compat";
const defaults = {
  adapter: "sqlite3",
  pool: Object.hasOwn(ENV, "TRAILS_MAX_THREADS") ? ENV.TRAILS_MAX_THREADS : 5,
  timeout: 5000,
};
export default {
  development: { ...defaults, database: "storage/development.sqlite3" },
  production: { ...defaults, database: "storage/production.sqlite3" },
};
`,
    );

    const primary = await spawnDbconsole("pragma database_list;\\n.exit\\n", "-e production");
    assertOutput("sqlite>", primary, 100);

    assertOutput("production.sqlite3", primary);
  });
});
