import { Migration } from "../../../migration.js";

export class WeNeedThings extends Migration {
  async up(): Promise<void> {
    await this.createTable("things", (t) => {
      t.column("content", "text");
    });
  }

  async down(): Promise<void> {
    await this.dropTable("things");
  }
}
