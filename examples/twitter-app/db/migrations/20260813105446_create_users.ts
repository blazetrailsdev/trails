import { Migration } from "@blazetrails/activerecord";

export class CreateUsers extends Migration {
  async change(): Promise<void> {
    await this.createTable("users", (t) => {
      t.string("handle");
      t.string("display_name");
      t.string("bio");
      t.string("password_digest");
      t.timestamps();
      // Backs the model's validatesUniqueness("handle") at the DB level so
      // concurrent sign-ups cannot race in a duplicate handle.
      t.index(["handle"], { unique: true });
    });
  }
}
