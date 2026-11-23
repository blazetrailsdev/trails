import { Migration } from "@blazetrails/activerecord";

export class CreateSessions extends Migration.get(8.0) {
  async change(): Promise<void> {
    await this.createTable("sessions", (t) => {
      t.references("user", { null: false, foreignKey: true });
      t.string("ip_address");
      t.string("user_agent");

      t.timestamps();
    });
  }
}
