import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Dir, File, extend, include } from "@blazetrails/ruby-compat";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { capture, quietly } from "@blazetrails/activesupport/testing/stream";
import { Error as GeneratorsError } from "../../lib/generators/base.js";
import { CreateMigration } from "../../lib/generators/actions/create-migration.js";
import { ClassMethods, Migration } from "../../lib/generators/migration.js";
import { MigrationGenerator } from "../../lib/generators/trails/migration/migration-generator.js";
import { TestCase } from "../../lib/generators/test-case.js";

class Migrator extends MigrationGenerator {
  static nextMigrationNumber(this: typeof ClassMethods, dirname: string): number {
    return this.currentMigrationNumber(dirname) + 1;
  }
}
include(Migrator, Migration);
extend(Migrator, ClassMethods);

type Generator = Migrator & { setMigrationAssignsBang(destination: string): void };

class CreateMigrationTest extends TestCase {
  declare _generator: Generator | null;
  migration!: CreateMigration;
  existingMigration!: CreateMigration;

  defaultDestinationPath(): string {
    return "db/migrate/create_articles.rb";
  }

  createMigration(
    destinationPath: string = this.defaultDestinationPath(),
    config: Record<string, unknown> = {},
    generatorOptions: Record<string, unknown> = {},
    block: (() => string) | null = null,
  ): CreateMigration {
    const migrationName = File.basename(destinationPath, ".rb");
    this.generator([migrationName], generatorOptions);
    (this.generator() as Generator).setMigrationAssignsBang(destinationPath);

    const [dir, base] = File.split(destinationPath);
    const timestampedDestinationPath = File.join(dir, ["%migration_number%", base].join("_"));

    return (this.migration = new CreateMigration(
      this.generator() as never,
      timestampedDestinationPath,
      block ?? "contents",
      config,
    ));
  }

  async migrationExistsBang(...args: Parameters<CreateMigrationTest["createMigration"]>) {
    this.existingMigration = this.createMigration(...args);
    await this.invokeBang();
    this._generator = null;
  }

  invokeBang(): Promise<string> {
    return capture("stdout", () => this.migration.invokeBang());
  }

  revokeBang(): Promise<string> {
    return capture("stdout", () => this.migration.revokeBang());
  }
}
CreateMigrationTest.destination(Dir.mktmpdir());
registerSpecType(/^CreateMigrationTest$/, CreateMigrationTest);

let t: CreateMigrationTest;

beforeAll(() => CreateMigrationTest.tests(Migrator));

beforeEach((context) => {
  t = context.testCase as CreateMigrationTest;
  t.prepareDestination();
});

afterEach(() => {
  t._generator = null;
});

describe("CreateMigrationTest", () => {
  it("invoke", async () => {
    t.createMigration();

    expect(await t.invokeBang()).toMatch(/create {2}db\/migrate\/1_create_articles\.rb\n/);
    await t.assertFile(t.migration.destination);
  });

  it("invoke pretended", async () => {
    t.createMigration(t.defaultDestinationPath(), {}, { pretend: true });

    const stdout = await t.invokeBang();
    expect(stdout).toMatch(/create {2}db\/migrate\/1_create_articles\.rb\n/);
    t.assertNoFile(t.migration.destination);
  });

  it("invoke when exists", async () => {
    await t.migrationExistsBang();
    t.createMigration();

    expect(t.migration.existingMigration()).toBe(t.existingMigration.destination);
  });

  it("invoke when exists identical", async () => {
    await t.migrationExistsBang();
    t.createMigration();

    expect(await t.invokeBang()).toMatch(/identical {2}db\/migrate\/1_create_articles\.rb\n/);
    expect(await t.migration.isIdentical()).toBeTruthy();
  });

  it("invoke return existing file when exists identical", async () => {
    await t.migrationExistsBang();
    t.createMigration();

    let invokedFile: unknown = null;
    await quietly(async () => {
      invokedFile = await t.migration.invokeBang();
    });
    expect(invokedFile).toBe(t.existingMigration.relativeExistingMigration());
  });

  it("invoke when exists not identical", async () => {
    await t.migrationExistsBang();
    t.createMigration(undefined, undefined, undefined, () => "different content");

    await expect(t.invokeBang()).rejects.toThrow(GeneratorsError);
  });

  it("invoke forced when exists not identical", async () => {
    const dest = "db/migrate/migration.rb";
    await t.migrationExistsBang(dest);
    t.createMigration(dest, { force: true }, undefined, () => "different content");

    const stdout = await t.invokeBang();
    expect(stdout).toMatch(/remove {2}db\/migrate\/1_migration\.rb\n/);
    expect(stdout).toMatch(/create {2}db\/migrate\/2_migration\.rb\n/);
    await t.assertFile(t.migration.destination);
    t.assertNoFile(t.existingMigration.destination);
  });

  it("invoke forced pretended when exists not identical", async () => {
    await t.migrationExistsBang();
    t.createMigration(
      t.defaultDestinationPath(),
      { force: true },
      { pretend: true },
      () => "different content",
    );

    const stdout = await t.invokeBang();
    expect(stdout).toMatch(/remove {2}db\/migrate\/1_create_articles\.rb\n/);
    expect(stdout).toMatch(/create {2}db\/migrate\/2_create_articles\.rb\n/);
    t.assertNoFile(t.migration.destination);
  });

  it("invoke skipped when exists not identical", async () => {
    await t.migrationExistsBang();
    t.createMigration(t.defaultDestinationPath(), {}, { skip: true }, () => "different content");

    expect(await t.invokeBang()).toMatch(/skip {2}db\/migrate\/2_create_articles\.rb\n/);
    t.assertNoFile(t.migration.destination);
  });

  it("revoke", async () => {
    await t.migrationExistsBang();
    t.createMigration();

    expect(await t.revokeBang()).toMatch(/remove {2}db\/migrate\/1_create_articles\.rb\n/);
    t.assertNoFile(t.existingMigration.destination);
  });

  it("revoke pretended", async () => {
    await t.migrationExistsBang();
    t.createMigration(t.defaultDestinationPath(), {}, { pretend: true });

    expect(await t.revokeBang()).toMatch(/remove {2}db\/migrate\/1_create_articles\.rb\n/);
    await t.assertFile(t.existingMigration.destination);
  });

  it("revoke when no exists", async () => {
    t.createMigration();

    expect(await t.revokeBang()).toMatch(/remove {2}db\/migrate\/1_create_articles\.rb\n/);
  });
});
