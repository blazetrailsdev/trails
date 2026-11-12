import { Migration } from "../../../lib/migration.js";

export class PeopleHaveDescriptions extends Migration.Current {
  async up(): Promise<void> {
    await this.addColumn("people", "description", "text");
  }

  async down(): Promise<void> {
    await this.removeColumn("people", "description");
  }
}
