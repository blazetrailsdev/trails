import { Migration } from "../../../migration.js";

export class AddPeopleDescription extends Migration {
  async up(): Promise<void> {
    await this.addColumn("people", "description", "string");
  }

  async down(): Promise<void> {
    await this.removeColumn("people", "description");
  }
}
