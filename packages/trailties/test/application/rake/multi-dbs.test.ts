import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  block,
  env,
  getPath,
  getProcessAdapter,
  rbFLoad,
  registerProcessAdapter,
  setEnv,
} from "@blazetrails/ruby-compat";
import { Base, DatabaseTasks, Migrator } from "@blazetrails/activerecord";
import { DSL, Rake } from "@blazetrails/rake";
import { Trails } from "../../../lib/trails.js";
import { Application } from "../../../lib/application.js";
import { Configuration } from "../../../lib/application/configuration.js";
import { Actions } from "../../../lib/command/actions.js";
import { lookupBang } from "../../../lib/command/behavior.js";

let seedLoads = 0;

async function runTask(task: string, vars: Record<string, string> = {}): Promise<void> {
  const was = Object.fromEntries(Object.keys(vars).map((k) => [k, env[k]]));
  const seats = DatabaseTasks as unknown as Record<string, unknown>;
  const migratorPathsWas = Migrator.migrationsPaths;
  const seatsWas = ["_root", "_dbDir", "_migrationsPaths", "_seedLoader"].map(
    (k) => [k, seats[k]] as const,
  );
  for (const [k, v] of Object.entries(vars)) setEnv(k, v);
  try {
    Base.configurations(
      (await new Configuration(process.cwd()).databaseConfiguration()) as Parameters<
        typeof Base.configurations
      >[0],
    );
    DatabaseTasks.root = process.cwd();
    DatabaseTasks.dbDir = "db";
    DatabaseTasks.migrationsPaths = [path.join(process.cwd(), "db", "migrate")];
    DatabaseTasks.seedLoader = {
      async loadSeed() {
        const seedFile = path.join(process.cwd(), "db", "seeds.ts");
        if (fs.existsSync(seedFile)) {
          await import(`${getPath().pathToFileURL!(seedFile).href}?_t=${++seedLoads}`);
        }
      },
    };
    await Base.establishConnection();
    class DbTaskApp extends Application {}
    Application.register(DbTaskApp);
    Trails.application!.config.setRoot(process.cwd());
    await Rake.withApplication(async (rake) => {
      DSL.task(
        "environment",
        block(() => Actions.bootApplicationBang()),
      );
      await rbFLoad(
        path.resolve(import.meta.dirname, "../../../../activerecord/lib/trailties/databases.ts"),
      );
      await rake.invokeTask(task);
    });
  } finally {
    for (const [k, v] of Object.entries(was)) setEnv(k, v);
    for (const [k, v] of seatsWas) seats[k] = v;
    Trails.application = null;
    Application.appClass = null;
    Migrator.migrationsPaths = migratorPathsWas;
    await Base.connectionHandler.clearAllConnectionsBang();
  }
}

await lookupBang();

describe("RakeMultiDbsTest", { timeout: 30_000 }, () => {
  let tmpDir: string;
  let originalCwd: string;
  let logs: string[];
  let errs: string[];
  let origExitCode: typeof process.exitCode;
  const origNodeEnv = env.NODE_ENV;

  beforeEach(() => {
    setEnv("NODE_ENV", undefined);
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-db-cli-"));
    originalCwd = process.cwd();
    fs.mkdirSync(path.join(tmpDir, "config"), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, "db", "migrate"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, "config", "database.ts"),
      `export default {
  development: { adapter: "sqlite3", database: ":memory:" },
  test: { adapter: "sqlite3", database: ":memory:" },
};`,
    );
    process.chdir(tmpDir);

    logs = [];
    errs = [];
    origExitCode = process.exitCode;
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(args.map((a) => String(a)).join(" "));
    });
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      errs.push(args.map((a) => String(a)).join(" "));
    });
    process.exitCode = undefined;
  });

  afterEach(() => {
    setEnv("NODE_ENV", origNodeEnv);
    process.chdir(originalCwd);
    vi.restoreAllMocks();
    process.exitCode = origExitCode;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  async function tableExists(dbFile: string, table: string): Promise<boolean> {
    const { SQLite3Adapter } =
      await import("@blazetrails/activerecord/connection-adapters/sqlite3-adapter.js");
    const adapter = new SQLite3Adapter({ database: dbFile });
    try {
      const rows = (await adapter.execute(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='${table}'`,
      ))!;
      return rows.length === 1;
    } finally {
      await adapter.disconnectBang();
    }
  }

  it("db:migrate respects timestamp ordering across databases", async () => {
    const primaryDb = path.join(tmpDir, "ordering-primary.sqlite3");
    const animalsDb = path.join(tmpDir, "ordering-animals.sqlite3");
    fs.writeFileSync(
      path.join(tmpDir, "config", "database.ts"),
      `export default {
  development: {
    primary: { adapter: "sqlite3", database: ${JSON.stringify(primaryDb)} },
    animals: { adapter: "sqlite3", database: ${JSON.stringify(animalsDb)}, migrationsPaths: "db/migrate_animals" },
  },
  test: {
    primary: { adapter: "sqlite3", database: ${JSON.stringify(primaryDb)} },
    animals: { adapter: "sqlite3", database: ${JSON.stringify(animalsDb)}, migrationsPaths: "db/migrate_animals" },
  },
};`,
    );
    fs.mkdirSync(path.join(tmpDir, "db", "migrate_animals"), { recursive: true });
    const migration = (cls: string, table: string) =>
      `import { Migration } from "@blazetrails/activerecord";
export class ${cls} extends Migration.Current {
  async up() { await this.createTable(${JSON.stringify(table)}, (t) => { t.string("name"); }); }
  async down() { await this.dropTable(${JSON.stringify(table)}); }
}`;
    fs.writeFileSync(
      path.join(tmpDir, "db", "migrate", "20260101000001_one_migration.ts"),
      migration("OneMigration", "ones"),
    );
    fs.writeFileSync(
      path.join(tmpDir, "db", "migrate_animals", "20260101000002_two_migration.ts"),
      migration("TwoMigration", "twos"),
    );
    fs.writeFileSync(
      path.join(tmpDir, "db", "migrate", "20260101000003_three_migration.ts"),
      migration("ThreeMigration", "threes"),
    );
    fs.writeFileSync(
      path.join(tmpDir, "db", "migrate_animals", "20260101000004_four_migration.ts"),
      migration("FourMigration", "fours"),
    );

    await runTask("db:create");

    const previous = getProcessAdapter();
    let output = "";
    registerProcessAdapter({
      ...previous,
      stdout: {
        ...previous.stdout,
        write: (chunk: string) => {
          output += chunk;
          return true;
        },
      },
    });
    try {
      await runTask("db:migrate");
    } finally {
      registerProcessAdapter(previous);
    }

    const entries = [...output.matchAll(/^== (\d+).+migrated/gm)].map((m) => m[1]);
    expect(entries).toEqual([
      "20260101000001",
      "20260101000002",
      "20260101000003",
      "20260101000004",
    ]);
  });

  it("db:rollback:namespace works", async () => {
    const primaryDb = path.join(tmpDir, "rollback-primary.sqlite3");
    const animalsDb = path.join(tmpDir, "rollback-animals.sqlite3");
    fs.writeFileSync(
      path.join(tmpDir, "config", "database.ts"),
      `export default {
  development: {
    primary: { adapter: "sqlite3", database: ${JSON.stringify(primaryDb)} },
    animals: { adapter: "sqlite3", database: ${JSON.stringify(animalsDb)}, migrationsPaths: "db/migrate_animals" },
  },
  test: {
    primary: { adapter: "sqlite3", database: ${JSON.stringify(primaryDb)} },
    animals: { adapter: "sqlite3", database: ${JSON.stringify(animalsDb)}, migrationsPaths: "db/migrate_animals" },
  },
};`,
    );
    fs.mkdirSync(path.join(tmpDir, "db", "migrate_animals"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, "db", "migrate", "20260101000000_create_users.ts"),
      `import { Migration } from "@blazetrails/activerecord";
export class CreateUsers extends Migration.Current {
  async up() { await this.createTable("users", (t) => { t.string("name"); }); }
  async down() { await this.dropTable("users"); }
}`,
    );
    fs.writeFileSync(
      path.join(tmpDir, "db", "migrate_animals", "20260101000001_create_dogs.ts"),
      `import { Migration } from "@blazetrails/activerecord";
export class CreateDogs extends Migration.Current {
  async up() { await this.createTable("dogs", (t) => { t.string("breed"); }); }
  async down() { await this.dropTable("dogs"); }
}`,
    );

    await runTask("db:create");
    await runTask("db:migrate");

    expect(await tableExists(primaryDb, "users")).toBe(true);
    expect(await tableExists(animalsDb, "dogs")).toBe(true);

    await runTask("db:rollback:primary");
    expect(await tableExists(primaryDb, "users")).toBe(false);
    expect(await tableExists(animalsDb, "dogs")).toBe(true);

    await runTask("db:rollback:animals");
    expect(await tableExists(animalsDb, "dogs")).toBe(false);
  });

  it("db:prepare works on all databases", async () => {
    const primaryDb = path.join(tmpDir, "prepare-primary.sqlite3");
    const animalsDb = path.join(tmpDir, "prepare-animals.sqlite3");
    const testPrimaryDb = path.join(tmpDir, "prepare-primary-test.sqlite3");
    const testAnimalsDb = path.join(tmpDir, "prepare-animals-test.sqlite3");
    fs.writeFileSync(
      path.join(tmpDir, "config", "database.ts"),
      `export default {
  development: {
    primary: { adapter: "sqlite3", database: ${JSON.stringify(primaryDb)} },
    animals: { adapter: "sqlite3", database: ${JSON.stringify(animalsDb)}, migrationsPaths: "db/migrate_animals" },
  },
  test: {
    primary: { adapter: "sqlite3", database: ${JSON.stringify(testPrimaryDb)} },
    animals: { adapter: "sqlite3", database: ${JSON.stringify(testAnimalsDb)}, migrationsPaths: "db/migrate_animals" },
  },
};`,
    );
    fs.mkdirSync(path.join(tmpDir, "db", "migrate_animals"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, "db", "migrate", "20260101000000_create_users.ts"),
      `import { Migration } from "@blazetrails/activerecord";
export class CreateUsers extends Migration.Current {
  async up() { await this.createTable("users", (t) => { t.string("name"); }); }
  async down() { await this.dropTable("users"); }
}`,
    );
    fs.writeFileSync(
      path.join(tmpDir, "db", "migrate_animals", "20260101000001_create_dogs.ts"),
      `import { Migration } from "@blazetrails/activerecord";
export class CreateDogs extends Migration.Current {
  async up() { await this.createTable("dogs", (t) => { t.string("breed"); }); }
  async down() { await this.dropTable("dogs"); }
}`,
    );
    expect(fs.existsSync(primaryDb)).toBe(false);
    expect(fs.existsSync(animalsDb)).toBe(false);

    await runTask("db:prepare");

    expect(fs.existsSync(primaryDb)).toBe(true);
    expect(fs.existsSync(animalsDb)).toBe(true);
    expect(fs.existsSync(testPrimaryDb)).toBe(true);
    expect(fs.existsSync(testAnimalsDb)).toBe(true);

    const { SQLite3Adapter } =
      await import("@blazetrails/activerecord/connection-adapters/sqlite3-adapter.js");
    const primary = new SQLite3Adapter({ database: primaryDb });
    try {
      expect(
        await primary.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='users'"),
      ).toHaveLength(1);
      expect(
        await primary.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='dogs'"),
      ).toHaveLength(0);
    } finally {
      await primary.disconnectBang();
    }
    const animals = new SQLite3Adapter({ database: animalsDb });
    try {
      expect(
        await animals.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='dogs'"),
      ).toHaveLength(1);
      expect(
        await animals.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='users'"),
      ).toHaveLength(0);
    } finally {
      await animals.disconnectBang();
    }
    const testPrimary = new SQLite3Adapter({ database: testPrimaryDb });
    try {
      expect(
        await testPrimary.execute(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='users'",
        ),
      ).toHaveLength(1);
    } finally {
      await testPrimary.disconnectBang();
    }
    const testAnimals = new SQLite3Adapter({ database: testAnimalsDb });
    try {
      expect(
        await testAnimals.execute(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='dogs'",
        ),
      ).toHaveLength(1);
    } finally {
      await testAnimals.disconnectBang();
    }
  });

  it("db:prepare runs seeds once", async () => {
    const primaryDb = path.join(tmpDir, "seed-once-primary.sqlite3");
    const animalsDb = path.join(tmpDir, "seed-once-animals.sqlite3");
    fs.writeFileSync(
      path.join(tmpDir, "config", "database.ts"),
      `export default {
  development: {
    primary: { adapter: "sqlite3", database: ${JSON.stringify(primaryDb)} },
    animals: { adapter: "sqlite3", database: ${JSON.stringify(animalsDb)}, migrationsPaths: "db/migrate_animals" },
  },
  test: {
    primary: { adapter: "sqlite3", database: ${JSON.stringify(primaryDb + ".test")} },
    animals: { adapter: "sqlite3", database: ${JSON.stringify(animalsDb + ".test")}, migrationsPaths: "db/migrate_animals" },
  },
};`,
    );
    fs.mkdirSync(path.join(tmpDir, "db", "migrate_animals"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, "db", "migrate", "20260101000000_create_users.ts"),
      `import { Migration } from "@blazetrails/activerecord";
export class CreateUsers extends Migration.Current {
  async up() { await this.createTable("users", (t) => { t.string("name"); }); }
  async down() { await this.dropTable("users"); }
}`,
    );
    fs.writeFileSync(
      path.join(tmpDir, "db", "migrate_animals", "20260101000001_create_dogs.ts"),
      `import { Migration } from "@blazetrails/activerecord";
export class CreateDogs extends Migration.Current {
  async up() { await this.createTable("dogs", (t) => { t.string("breed"); }); }
  async down() { await this.dropTable("dogs"); }
}`,
    );
    const seedMarker = path.join(tmpDir, "db", "seed-runs");
    fs.writeFileSync(
      path.join(tmpDir, "db", "seeds.ts"),
      `import * as fs from "node:fs";
const prev = fs.existsSync(${JSON.stringify(seedMarker)})
  ? Number(fs.readFileSync(${JSON.stringify(seedMarker)}, "utf8"))
  : 0;
fs.writeFileSync(${JSON.stringify(seedMarker)}, String(prev + 1));`,
    );

    await runTask("db:prepare");
    expect(fs.readFileSync(seedMarker, "utf8")).toBe("1");

    await runTask("db:prepare");
    expect(fs.readFileSync(seedMarker, "utf8")).toBe("1");
  });
});
