// vendor/rails/activerecord/test/migrations/to_copy/1_people_have_hobbies.rb
import { Migration } from "../../../migration.js";

export class PeopleHaveHobbies extends Migration {
  async up(): Promise<void> {
    await this.addColumn("people", "hobbies", "text");
  }

  async down(): Promise<void> {
    await this.removeColumn("people", "hobbies");
  }
}
