// vendor/rails/activerecord/test/migrations/to_copy/2_people_have_descriptions.rb
import { Migration } from "../../../migration.js";

export class PeopleHaveDescriptions extends Migration {
  async up(): Promise<void> {
    await this.addColumn("people", "description", "text");
  }

  async down(): Promise<void> {
    await this.removeColumn("people", "description");
  }
}
