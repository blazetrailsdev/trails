import type {} from "@blazetrails/vitest-matchers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Base as ActiveRecordBase } from "@blazetrails/activerecord";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { TopLevel, camelize } from "@blazetrails/activesupport";
import { TestCase } from "@blazetrails/trailties/generators/test-case";
import { Dir, File, FileUtils } from "@blazetrails/ruby-compat";
import { buildTemplates } from "@blazetrails/trails-tsc";
import { UpdateGenerator } from "../lib/generators/solid-queue/update/update-generator.js";

class UpdateGeneratorTest extends TestCase {}
UpdateGeneratorTest.tests(UpdateGenerator);
UpdateGeneratorTest.destination(Dir.mktmpdir());
registerSpecType(/^UpdateGeneratorTest$/, UpdateGeneratorTest);

let testCase: TestCase;
let previousConfigurations: ReturnType<typeof ActiveRecordBase.configurations>;

async function withMigrationTemplate(name: string, block: () => Promise<void>) {
  const sourceRoot = Dir.mktmpdir();
  try {
    await FileUtils.mkdirPAsync(File.join(sourceRoot, "db"));
    await File.writeAsync(
      File.join(sourceRoot, "db", `${name}.ts.tt`),
      `export class ${camelize(name)} extends Migration.get(7.1) {\n  async change(): Promise<void> {}\n}\n`,
    );

    await buildTemplates([sourceRoot]);

    vi.spyOn(UpdateGenerator, "sourceRoot").mockReturnValue(sourceRoot);
    await block();
  } finally {
    await FileUtils.rmRfAsync(sourceRoot);
  }
}

describe("UpdateGeneratorTest", () => {
  beforeEach((context) => {
    testCase = context.testCase as TestCase;
    testCase.prepareDestination();

    previousConfigurations = ActiveRecordBase.configurations();
    ActiveRecordBase.configurations({
      [String(TopLevel.Trails!.env)]: {
        primary: { adapter: "sqlite3", database: ":memory:" },
        queue: { adapter: "sqlite3", database: ":memory:", migrationsPaths: "db/queue_migrate" },
      },
    });
    vi.spyOn(TopLevel.Trails!, "application", "get").mockReturnValue({
      config: { paths: () => new Map([["db/migrate", { toAry: () => ["db/migrate"] }]]) },
    } as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    ActiveRecordBase.configurations(previousConfigurations);
  });

  it("copies new migrations to the queue database migrations path", async () => {
    await withMigrationTemplate("add_batches_to_solid_queue", async () => {
      await testCase.runGenerator();

      await testCase.assertMigration(
        "db/queue_migrate/add_batches_to_solid_queue.ts",
        (migration: string) => {
          expect(migration).toMatch(/class AddBatchesToSolidQueue/);
        },
      );
    });
  });

  it("copies new migrations to another database's migrations path", async () => {
    await withMigrationTemplate("add_batches_to_solid_queue", async () => {
      await testCase.runGenerator(["--database", "primary"]);

      await testCase.assertMigration("db/migrate/add_batches_to_solid_queue.ts");
    });
  });

  it("skips migrations that have already been copied", async () => {
    await withMigrationTemplate("add_batches_to_solid_queue", async () => {
      await testCase.runGenerator();
      await testCase.runGenerator();

      expect(
        (
          await Dir.globAsync(
            File.join(testCase.destinationRoot, "db/queue_migrate/*_add_batches_to_solid_queue.ts"),
          )
        ).length,
      ).toBe(1);
    });
  });

  it("does nothing when there are no new migrations", async () => {
    const emptySourceRoot = Dir.mktmpdir();
    try {
      await FileUtils.mkdirPAsync(File.join(emptySourceRoot, "db"));
      vi.spyOn(UpdateGenerator, "sourceRoot").mockReturnValue(emptySourceRoot);

      await testCase.runGenerator();

      expect(await Dir.globAsync(File.join(testCase.destinationRoot, "db/**/*.ts"))).toBeEmpty();
    } finally {
      await FileUtils.rmRfAsync(emptySourceRoot);
    }
  });

  it("copies the batches migration", async () => {
    await testCase.runGenerator();

    await testCase.assertMigration(
      "db/queue_migrate/add_batches_to_solid_queue.ts",
      (migration: string) => {
        expect(migration).toMatch(/class AddBatchesToSolidQueue/);
        expect(migration).toMatch(/createTable\("solid_queue_batches", \{ ifNotExists: true \}/);
      },
    );
  });
});
