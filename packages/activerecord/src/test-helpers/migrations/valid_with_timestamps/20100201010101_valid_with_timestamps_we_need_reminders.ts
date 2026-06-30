// vendor/rails/activerecord/test/migrations/valid_with_timestamps/20100201010101_valid_with_timestamps_we_need_reminders.rb
import { Migration } from "../../../migration.js";

export class ValidWithTimestampsWeNeedReminders extends Migration {
  async up(): Promise<void> {
    await this.createTable("reminders", (t) => {
      t.text("content");
      t.datetime("remind_at");
    });
  }

  async down(): Promise<void> {
    await this.dropTable("reminders");
  }
}

export default new ValidWithTimestampsWeNeedReminders();
