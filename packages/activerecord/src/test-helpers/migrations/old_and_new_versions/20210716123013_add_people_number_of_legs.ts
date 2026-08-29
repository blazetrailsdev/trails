import { Migration } from "../../../migration.js";

export class AddPeopleNumberOfLegs extends Migration {
  async up(): Promise<void> {
    await this.addColumn("people", "number_of_legs", "integer");
  }

  async down(): Promise<void> {
    await this.removeColumn("people", "number_of_legs");
  }
}
