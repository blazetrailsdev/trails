import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { AppGenerator, ModelGenerator } from "@blazetrails/railties/generators";
import { fixtures } from "./generator-fixtures.js";

let tmpDir: string;
let output: string[];

function makeModelGen(cwd: string) {
  return new ModelGenerator({ cwd, output: (m) => output.push(m) });
}

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-fixtures-"));
  output = [];

  const appGen = new AppGenerator({ cwd: tmpDir, output: (m) => output.push(m) });
  await appGen.run("docs", { database: "sqlite" });
});

afterAll(() => {
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
});

function appDir() {
  return path.join(tmpDir, "docs");
}

function readFile(relativePath: string): string {
  return fs.readFileSync(path.join(appDir(), relativePath), "utf-8");
}

function fileExists(relativePath: string): boolean {
  return fs.existsSync(path.join(appDir(), relativePath));
}

describe("generator fixtures", () => {
  describe("new docs", () => {
    it("creates expected app structure", () => {
      expect(fileExists("package.json")).toBe(true);
      expect(fileExists("tsconfig.json")).toBe(true);
      expect(fileExists("src/config/application.ts")).toBe(true);
      expect(fileExists("src/config/routes.ts")).toBe(true);
      expect(fileExists("src/config/database.ts")).toBe(true);
      expect(fileExists("src/app/models/application-record.ts")).toBe(true);
      expect(fileExists("src/app/controllers/application-controller.ts")).toBe(true);
      expect(fileExists("db/migrations/.gitkeep")).toBe(true);
      expect(fileExists("db/seeds.ts")).toBe(true);
    });

    it("package.json has correct name", () => {
      const pkg = JSON.parse(readFile("package.json"));
      expect(pkg.name).toBe("docs");
    });
  });

  describe("generate model User name:string email:string", () => {
    let files: string[];

    beforeAll(() => {
      output = [];
      const gen = makeModelGen(appDir());
      files = gen.run("User", ["name:string", "email:string"]);
    });

    it("creates model file", () => {
      expect(files).toContain("src/app/models/user.ts");
      const content = readFile("src/app/models/user.ts");
      expect(content).toContain("class User extends Base");
      expect(content).toContain('this.attribute("name", "string")');
      expect(content).toContain('this.attribute("email", "string")');
    });

    it("creates migration file", () => {
      const migFile = files.find((f) => f.startsWith("db/migrations/"));
      expect(migFile).toBeDefined();
      const content = readFile(migFile!);
      expect(content).toContain("class CreateUsers extends Migration");
      expect(content).toContain('t.string("name")');
      expect(content).toContain('t.string("email")');
      expect(content).toContain("t.timestamps()");
    });

    it("creates test file", () => {
      expect(files).toContain("test/models/user.test.ts");
    });
  });

  describe("generate model Folder name:string user_id:integer parent_id:integer", () => {
    let files: string[];

    beforeAll(() => {
      output = [];
      const gen = makeModelGen(appDir());
      files = gen.run("Folder", ["name:string", "user_id:integer", "parent_id:integer"]);
    });

    it("creates model file", () => {
      expect(files).toContain("src/app/models/folder.ts");
      const content = readFile("src/app/models/folder.ts");
      expect(content).toContain("class Folder extends Base");
      expect(content).toContain('this.attribute("name", "string")');
      expect(content).toContain('this.attribute("user_id", "integer")');
      expect(content).toContain('this.attribute("parent_id", "integer")');
    });

    it("creates migration with correct columns", () => {
      const migFile = files.find((f) => f.startsWith("db/migrations/"));
      expect(migFile).toBeDefined();
      const content = readFile(migFile!);
      expect(content).toContain("class CreateFolders extends Migration");
      expect(content).toContain('t.string("name")');
      expect(content).toContain('t.integer("user_id")');
      expect(content).toContain('t.integer("parent_id")');
    });
  });

  describe("generate model Document title:string body:text user_id:integer folder_id:integer", () => {
    let files: string[];

    beforeAll(() => {
      output = [];
      const gen = makeModelGen(appDir());
      files = gen.run("Document", [
        "title:string",
        "body:text",
        "user_id:integer",
        "folder_id:integer",
      ]);
    });

    it("creates model file", () => {
      expect(files).toContain("src/app/models/document.ts");
      const content = readFile("src/app/models/document.ts");
      expect(content).toContain("class Document extends Base");
      expect(content).toContain('this.attribute("title", "string")');
      expect(content).toContain('this.attribute("body", "text")');
      expect(content).toContain('this.attribute("user_id", "integer")');
      expect(content).toContain('this.attribute("folder_id", "integer")');
    });

    it("creates migration with correct columns", () => {
      const migFile = files.find((f) => f.startsWith("db/migrations/"));
      expect(migFile).toBeDefined();
      const content = readFile(migFile!);
      expect(content).toContain("class CreateDocuments extends Migration");
      expect(content).toContain('t.string("title")');
      expect(content).toContain('t.text("body")');
      expect(content).toContain('t.integer("user_id")');
      expect(content).toContain('t.integer("folder_id")');
    });
  });

  describe("Music tutorial generators", () => {
    let artistFiles: string[];
    let albumFiles: string[];
    let trackFiles: string[];
    let genreFiles: string[];

    function findMigration(files: string[], pattern: RegExp): string {
      const migFile = files.find((f) => pattern.test(f));
      expect(migFile).toBeDefined();
      return readFile(migFile!);
    }

    beforeAll(() => {
      output = [];
      const cwd = appDir();
      artistFiles = makeModelGen(cwd).run("Artist", ["name:string", "bio:text"]);
      albumFiles = makeModelGen(cwd).run("Album", [
        "title:string",
        "artist_id:integer",
        "release_date:date",
      ]);
      trackFiles = makeModelGen(cwd).run("Track", [
        "title:string",
        "album_id:integer",
        "track_number:integer",
        "duration:integer",
      ]);
      genreFiles = makeModelGen(cwd).run("Genre", ["name:string"]);
    });

    it("creates Artist model and migration", () => {
      expect(artistFiles).toContain("src/app/models/artist.ts");
      const content = readFile("src/app/models/artist.ts");
      expect(content).toContain("class Artist extends Base");
      expect(content).toContain('this.attribute("name", "string")');
      expect(content).toContain('this.attribute("bio", "text")');

      const mig = findMigration(artistFiles, /db\/migrations\/.+-create-artists\.ts$/);
      expect(mig).toContain('t.string("name")');
      expect(mig).toContain('t.text("bio")');
    });

    it("creates Album model and migration", () => {
      expect(albumFiles).toContain("src/app/models/album.ts");
      const content = readFile("src/app/models/album.ts");
      expect(content).toContain("class Album extends Base");
      expect(content).toContain('this.attribute("artist_id", "integer")');
      expect(content).toContain('this.attribute("release_date", "date")');

      const mig = findMigration(albumFiles, /db\/migrations\/.+-create-albums\.ts$/);
      expect(mig).toContain('t.integer("artist_id")');
      expect(mig).toContain('t.date("release_date")');
    });

    it("creates Track model and migration", () => {
      expect(trackFiles).toContain("src/app/models/track.ts");
      const content = readFile("src/app/models/track.ts");
      expect(content).toContain("class Track extends Base");
      expect(content).toContain('this.attribute("track_number", "integer")');
      expect(content).toContain('this.attribute("duration", "integer")');

      const mig = findMigration(trackFiles, /db\/migrations\/.+-create-tracks\.ts$/);
      expect(mig).toContain('t.integer("track_number")');
      expect(mig).toContain('t.integer("duration")');
    });

    it("creates Genre model and migration", () => {
      expect(genreFiles).toContain("src/app/models/genre.ts");
      const content = readFile("src/app/models/genre.ts");
      expect(content).toContain("class Genre extends Base");

      const mig = findMigration(genreFiles, /db\/migrations\/.+-create-genres\.ts$/);
      expect(mig).toContain('t.string("name")');
    });
  });

  describe("Finances tutorial generators", () => {
    let accountFiles: string[];
    let categoryFiles: string[];
    let transactionFiles: string[];
    let budgetFiles: string[];

    function findMigration(files: string[], pattern: RegExp): string {
      const migFile = files.find((f) => pattern.test(f));
      expect(migFile).toBeDefined();
      return readFile(migFile!);
    }

    beforeAll(() => {
      output = [];
      const cwd = appDir();
      accountFiles = makeModelGen(cwd).run("Account", ["name:string", "balance:decimal"]);
      categoryFiles = makeModelGen(cwd).run("Category", ["name:string", "parent_id:integer"]);
      transactionFiles = makeModelGen(cwd).run("Transaction", [
        "description:string",
        "amount:decimal",
        "account_id:integer",
        "category_id:integer",
        "date:date",
      ]);
      budgetFiles = makeModelGen(cwd).run("Budget", [
        "category_id:integer",
        "amount:decimal",
        "period_start:date",
        "period_end:date",
      ]);
    });

    it("creates Account model and migration", () => {
      expect(accountFiles).toContain("src/app/models/account.ts");
      const content = readFile("src/app/models/account.ts");
      expect(content).toContain("class Account extends Base");
      expect(content).toContain('this.attribute("balance", "decimal")');

      const mig = findMigration(accountFiles, /db\/migrations\/.+-create-accounts\.ts$/);
      expect(mig).toContain('t.decimal("balance")');
    });

    it("creates Category model with self-referential parent_id", () => {
      expect(categoryFiles).toContain("src/app/models/category.ts");
      const content = readFile("src/app/models/category.ts");
      expect(content).toContain("class Category extends Base");
      expect(content).toContain('this.attribute("parent_id", "integer")');

      const mig = findMigration(categoryFiles, /db\/migrations\/.+-create-categories\.ts$/);
      expect(mig).toContain('t.integer("parent_id")');
    });

    it("creates Transaction model and migration", () => {
      expect(transactionFiles).toContain("src/app/models/transaction.ts");
      const content = readFile("src/app/models/transaction.ts");
      expect(content).toContain("class Transaction extends Base");
      expect(content).toContain('this.attribute("amount", "decimal")');
      expect(content).toContain('this.attribute("account_id", "integer")');
      expect(content).toContain('this.attribute("category_id", "integer")');

      const mig = findMigration(transactionFiles, /db\/migrations\/.+-create-transactions\.ts$/);
      expect(mig).toContain('t.decimal("amount")');
      expect(mig).toContain('t.integer("account_id")');
      expect(mig).toContain('t.date("date")');
    });

    it("creates Budget model and migration", () => {
      expect(budgetFiles).toContain("src/app/models/budget.ts");
      const content = readFile("src/app/models/budget.ts");
      expect(content).toContain("class Budget extends Base");
      expect(content).toContain('this.attribute("period_start", "date")');
      expect(content).toContain('this.attribute("period_end", "date")');

      const mig = findMigration(budgetFiles, /db\/migrations\/.+-create-budgets\.ts$/);
      expect(mig).toContain('t.date("period_start")');
      expect(mig).toContain('t.date("period_end")');
    });
  });
});

describe("exported fixtures", () => {
  let fixtureDir: string;

  function matchesPattern(dir: string, pattern: string): boolean {
    if (!pattern.includes("*")) {
      return fs.existsSync(path.join(dir, pattern));
    }
    const lastSlash = pattern.lastIndexOf("/");
    const dirPart = lastSlash === -1 ? "" : pattern.slice(0, lastSlash);
    const filePattern = lastSlash === -1 ? pattern : pattern.slice(lastSlash + 1);
    const fullDir = path.join(dir, dirPart);
    if (!fs.existsSync(fullDir) || !fs.statSync(fullDir).isDirectory()) return false;
    const [prefix, suffix] = filePattern.split("*");
    return fs
      .readdirSync(fullDir)
      .some((entry) => entry.startsWith(prefix) && entry.endsWith(suffix));
  }

  function runFixtureCommand(cwd: string, command: string): string[] {
    const parts = command.split(/\s+/);
    if (parts[0] !== "generate" || parts[1] !== "model") {
      throw new Error(`Unsupported fixture command: ${command}`);
    }
    const name = parts[2];
    const args = parts.slice(3);
    const gen = new ModelGenerator({ cwd, output: () => {} });
    return gen.run(name, args);
  }

  beforeAll(async () => {
    fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-fixture-validation-"));
    fs.writeFileSync(path.join(fixtureDir, "tsconfig.json"), "{}");
    fs.mkdirSync(path.join(fixtureDir, "db/migrations"), { recursive: true });

    const allFixtures = [...fixtures.docs, ...fixtures.music, ...fixtures.finances];
    for (const fixture of allFixtures) {
      runFixtureCommand(fixtureDir, fixture.command);
    }
  });

  afterAll(() => {
    if (fixtureDir) fs.rmSync(fixtureDir, { recursive: true, force: true });
  });

  it("each fixture command produces its expectedFiles", () => {
    const allFixtures = [...fixtures.docs, ...fixtures.music, ...fixtures.finances];
    for (const fixture of allFixtures) {
      for (const expectedFile of fixture.expectedFiles) {
        expect(matchesPattern(fixtureDir, expectedFile)).toBe(true);
      }
    }
  });
});
