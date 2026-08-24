// vendor/rails/activerecord/test/migrations/scope/2_mysql_only.mysql.rb
import { Migration } from "../../../migration.js";

export class MysqlOnly extends Migration {
  async change(): Promise<void> {
    await this.createTable("mysql_only");
  }
}
