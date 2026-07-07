import { Migration } from "../../../migration.js";

export class FutureTimestampMigration extends Migration {
  async up(): Promise<void> {}

  async down(): Promise<void> {}
}

export default new FutureTimestampMigration();
