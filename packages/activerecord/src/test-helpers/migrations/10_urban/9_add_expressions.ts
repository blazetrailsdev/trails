import { Migration } from "../../../migration.js";

export class AddExpressions extends Migration {
  async up(): Promise<void> {
    await this.createTable("expressions", (t) => {
      t.string("expression");
    });
  }

  async down(): Promise<void> {
    await this.dropTable("expressions");
  }
}
