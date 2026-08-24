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

/**
 * Silences `console.error` the way each happy-path suite already did, but keeps
 * what was written. A bare `mockImplementation(() => {})` throws the CLI's own
 * diagnostics away, so a red `expect(exitCode).toBe(0)` reports "expected 1 to
 * be +0" and nothing else — which is exactly how a MariaDB-only `ar db:create`
 * failure (run 30566573740, missing `ar_cli_e2e%` grant) reached CI with no
 * attributable cause. Pair with {@link exitReason} on every exit-code
 * assertion.
 */
export function captureConsoleErrors(): string[] {
  const errors: string[] = [];
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    errors.push(
      args.map((a) => (a instanceof Error ? (a.stack ?? a.message) : String(a))).join(" "),
    );
  });
  return errors;
}

/** The assertion message for an exit-code check, carrying whatever {@link captureConsoleErrors} collected. */
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
