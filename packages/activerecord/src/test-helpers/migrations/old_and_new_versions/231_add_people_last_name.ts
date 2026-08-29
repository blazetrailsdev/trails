import { Migration } from "../../../migration.js";

export class AddPeopleLastName extends Migration {
  async up(): Promise<void> {
    await this.addColumn("people", "last_name", "string");
  }

  async down(): Promise<void> {
    await this.removeColumn("people", "last_name");
  }
}
