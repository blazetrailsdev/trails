import { Migration } from "../../../migration.js";

export class MysqlOnly extends Migration.Current {
  async change(): Promise<void> {
    await this.createTable("mysql_only");
  }
}
