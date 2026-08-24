// vendor/rails/activerecord/test/migrations/scope/1_unscoped.rb
import { Migration } from "../../../migration.js";

export class Unscoped extends Migration {
  async change(): Promise<void> {
    await this.createTable("unscoped");
  }
}
