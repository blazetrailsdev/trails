// vendor/rails/activerecord/test/migrations/valid/3_innocent_jointable.rb
import { Migration } from "../../../migration.js";

export class InnocentJointable extends Migration {
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

export default new InnocentJointable();
