import { Migration } from "../../../lib/migration.js";

export class AddPeopleHobby extends Migration.Current {
  async up(): Promise<void> {
    await this.addColumn("people", "hobby", "string");
  }

  async down(): Promise<void> {
    await this.removeColumn("people", "hobby");
  }
}
