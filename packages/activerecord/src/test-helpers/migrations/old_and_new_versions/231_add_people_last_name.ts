// vendor/rails/activerecord/test/migrations/old_and_new_versions/231_add_people_last_name.rb
import { Migration } from "../../../migration.js";

export class AddPeopleLastName extends Migration {
  async up(): Promise<void> {
    await this.addColumn("people", "last_name", "string");
  }

  async down(): Promise<void> {
    await this.removeColumn("people", "last_name");
  }
}

export default new AddPeopleLastName();
