import { DatabaseTasks, Migrator } from "@blazetrails/activerecord";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { vi } from "vitest";

export const MIGRATION_BODY = `\
import { Migration } from "@blazetrails/activerecord";

export class AddUsersTable extends Migration {
  async up() {
    await this.connection.createTable("users", (t) => {
      t.string("name");
    });
  }
  async down() {
    await this.connection.dropTable("users");
  }
}
`;

export function captureConsoleErrors(): string[] {
  const errors: string[] = [];
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    errors.push(
      args.map((a) => (a instanceof Error ? (a.stack ?? a.message) : String(a))).join(" "),
    );
  });
  return errors;
}

export function exitReason(label: string, errors: string[]): string {
  return errors.length === 0 ? label : `${label}\n${errors.join("\n")}`;
}

export async function mkE2eTmpDir(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

export async function teardownE2eFixture(tmpDir: string): Promise<void> {
  DatabaseTasks.databaseConfiguration = null;
  (DatabaseTasks as unknown as { _root: string | null })._root = null;
  Migrator.migrationsPaths = ["db/migrate"];
  DatabaseTasks.seedLoader = null;
  await rm(tmpDir, { recursive: true, force: true });
}
