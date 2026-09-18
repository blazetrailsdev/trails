import { Migration } from "../../../migration.js";

export class RenameThings extends Migration {
  async up(): Promise<void> {
    await this.renameTable("things", "awesome_things");
  }

  async down(): Promise<void> {
    await this.renameTable("awesome_things", "things");
  }
}
