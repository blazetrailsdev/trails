// vendor/rails/activerecord/test/migrations/old_and_new_versions/20210716123013_add_people_number_of_legs.rb
import { Migration } from "../../../migration.js";

export class AddPeopleNumberOfLegs extends Migration {
  async up(): Promise<void> {
    await this.addColumn("people", "number_of_legs", "integer");
  }

  async down(): Promise<void> {
    await this.removeColumn("people", "number_of_legs");
  }
}

export default new AddPeopleNumberOfLegs();
