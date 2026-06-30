// vendor/rails/activerecord/test/migrations/valid_with_subdirectories/sub/2_we_need_reminders.rb
import { Migration } from "../../../../migration.js";

export class WeNeedReminders extends Migration {
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

export default new WeNeedReminders();
