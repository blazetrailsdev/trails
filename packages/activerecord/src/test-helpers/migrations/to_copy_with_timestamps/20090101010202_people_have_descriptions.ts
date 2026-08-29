import { Migration } from "../../../migration.js";

export class PeopleHaveDescriptions extends Migration {
  async up(): Promise<void> {
    await this.addColumn("people", "description", "text");
  }

  async down(): Promise<void> {
    await this.removeColumn("people", "description");
  }
}
