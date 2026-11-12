import { Migration } from "../../../lib/migration.js";

export class Unscoped extends Migration.Current {
  async change(): Promise<void> {
    await this.createTable("unscoped");
  }
}
