import { Migration } from "../../../migration.js";

export class PeopleHaveHobbies extends Migration {
  async up(): Promise<void> {
    await this.addColumn("people", "hobbies", "text");
  }

  async down(): Promise<void> {
    await this.removeColumn("people", "hobbies");
  }
}
