import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { Isolation } from "@blazetrails/activesupport/testing/isolation";
import { Dir, getFs, include } from "@blazetrails/ruby-compat";
import type { Generation } from "../support/isolation/abstract-unit.js";
import "../support/isolation/abstract-unit.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type
interface ActiveStorageInstallTest extends Generation {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class ActiveStorageInstallTest extends TestCase {}
include(ActiveStorageInstallTest, Isolation);

describe("active_storage:install", () => {
  let t: ActiveStorageInstallTest;

  beforeEach(async () => {
    t = new ActiveStorageInstallTest("test");
    await t.buildApp();
    const application = await t.appPath("config", "application.ts");
    const source = await getFs().readFile(application, "utf-8");
    await t.appFile(
      "config/application.ts",
      source.replace(
        `// import "@blazetrails/trailties/trailties/active-storage";`,
        `import "@blazetrails/activestorage/engine";`,
      ),
    );
  });

  afterEach(() => t.teardownApp());

  it("copies the create-tables migration once", { timeout: 240_000 }, async () => {
    const output = await t.trails("active_storage:install");
    expect(output).toMatch(
      /Copied migration \d+_create_active_storage_tables\.active_storage\.(?:ts|js) from active_storage/,
    );
    const migrate = `${await t.appPath()}/db/migrate/*.{ts,js}`;
    expect(await Dir.globAsync(migrate)).toHaveLength(1);

    expect(await t.trails("active_storage:install")).not.toMatch(/Copied migration/);
    expect(await Dir.globAsync(migrate)).toHaveLength(1);
  });

  it("active_storage:update copies the update migrations", { timeout: 240_000 }, async () => {
    const output = await t.trails("active_storage:update");
    expect(output).toMatch(
      /Copied migration \d+_add_service_name_to_active_storage_blobs\.active_storage\.(?:ts|js)/,
    );
    expect(output).toMatch(
      /Copied migration \d+_create_active_storage_variant_records\.active_storage\.(?:ts|js)/,
    );
    expect(await Dir.globAsync(`${await t.appPath()}/db/migrate/*.{ts,js}`)).toHaveLength(3);
  });
});
