// vendor/rails/activerecord/test/migrations/to_copy_with_timestamps/20090101010101_people_have_hobbies.rb
import { Migration } from "../../../migration.js";

export class PeopleHaveHobbies extends Migration {
  async up(): Promise<void> {
    await this.addColumn("people", "hobbies", "text");
  }

  async down(): Promise<void> {
    await this.removeColumn("people", "hobbies");
  }
}

export default new PeopleHaveHobbies();
