// vendor/rails/activerecord/test/migrations/valid_with_timestamps/20100301010101_valid_with_timestamps_innocent_jointable.rb
import { Migration } from "../../../migration.js";

export class ValidWithTimestampsInnocentJointable extends Migration {
  async up(): Promise<void> {
    await this.createTable("people_reminders", { id: false }, (t) => {
      t.integer("reminder_id");
      t.integer("person_id");
    });
  }

  async down(): Promise<void> {
    await this.dropTable("people_reminders");
  }
}

export default new ValidWithTimestampsInnocentJointable();
