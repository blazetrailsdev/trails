import { Migration } from "../../../migration.js";

export class AddPeopleHobby extends Migration {
  async up(): Promise<void> {
    await this.addColumn("people", "hobby", "string");
  }

  async down(): Promise<void> {
    await this.removeColumn("people", "hobby");
  }
}
