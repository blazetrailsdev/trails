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
