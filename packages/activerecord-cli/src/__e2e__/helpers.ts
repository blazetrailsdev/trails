import { DatabaseTasks } from "@blazetrails/activerecord";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

export const MIGRATION_BODY = `\
export default {
  async up() {
    await this.connection.createTable("users", (t) => {
      t.string("name");
    });
  },
  async down() {
    await this.connection.dropTable("users");
  },
};
`;

export async function mkE2eTmpDir(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

export async function teardownE2eFixture(tmpDir: string): Promise<void> {
  DatabaseTasks.databaseConfiguration = null;
  (DatabaseTasks as unknown as { _root: string | null })._root = null;
  DatabaseTasks.registerMigrations([]);
  DatabaseTasks.seedLoader = null;
  await rm(tmpDir, { recursive: true, force: true });
}
