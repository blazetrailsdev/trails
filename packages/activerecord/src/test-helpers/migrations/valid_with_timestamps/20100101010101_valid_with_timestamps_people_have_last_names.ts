// vendor/rails/activerecord/test/migrations/valid_with_timestamps/20100101010101_valid_with_timestamps_people_have_last_names.rb
import { Migration } from "../../../migration.js";

export class ValidWithTimestampsPeopleHaveLastNames extends Migration {
  async up(): Promise<void> {
    await this.addColumn("people", "last_name", "string");
  }

  async down(): Promise<void> {
    await this.removeColumn("people", "last_name");
  }
}

export default new ValidWithTimestampsPeopleHaveLastNames();
