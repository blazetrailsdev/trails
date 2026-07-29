import { Migration } from "../migration.js";

export function anonymousMigration(
  name?: string,
  version?: string,
  up: (m: Migration) => Promise<void> = async () => {},
  down: (m: Migration) => Promise<void> = async () => {},
): Migration {
  return new (class extends Migration {
    override async up(): Promise<void> {
      await up(this);
    }
    override async down(): Promise<void> {
      await down(this);
    }
  })(name, version);
}
