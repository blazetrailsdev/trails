import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { discoverMigrations } from "./migration-loader.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-loader-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const write = (name: string) => fs.writeFileSync(path.join(tmpDir, name), "export class M {}");

describe("discoverMigrations", () => {
  it("loads underscore-named migrations (Rails-faithful)", async () => {
    write("20260101000000_create_posts.ts");
    write("20260102000000_add_email_to_users.ts");
    const found = await discoverMigrations(tmpDir);
    expect(found.map((m) => `${m.version}:${m.name}`)).toEqual([
      "20260101000000:create_posts",
      "20260102000000:add_email_to_users",
    ]);
  });

  it("loads hyphen-named migrations as a transitional alias", async () => {
    write("20260101000000-create-posts.ts");
    const found = await discoverMigrations(tmpDir);
    expect(found).toHaveLength(1);
    expect(found[0]!.version).toBe("20260101000000");
  });

  it("collapses hyphen and underscore variants of the same migration, preferring underscore", async () => {
    write("20260101000000-create-posts.ts");
    write("20260101000000_create_posts.ts");
    const found = await discoverMigrations(tmpDir);
    expect(found).toHaveLength(1);
    expect(path.basename(found[0]!.filename!)).toBe("20260101000000_create_posts.ts");
  });

  it("prefers .ts over .js when both exist for the same migration", async () => {
    write("20260101000000_create_posts.ts");
    write("20260101000000_create_posts.js");
    const found = await discoverMigrations(tmpDir);
    expect(found).toHaveLength(1);
    expect(path.basename(found[0]!.filename!)).toBe("20260101000000_create_posts.ts");
  });
});
