// vendor/rails/activerecord/test/migrations/old_and_new_versions/20210716122844_add_people_description.rb
import { Migration } from "../../../migration.js";

export class AddPeopleDescription extends Migration {
  async up(): Promise<void> {
    await this.addColumn("people", "description", "string");
  }

  async down(): Promise<void> {
    await this.removeColumn("people", "description");
  }
}

export default new AddPeopleDescription();
