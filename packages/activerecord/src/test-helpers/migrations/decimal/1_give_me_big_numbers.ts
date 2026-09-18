import { Migration } from "../../../migration.js";

export class GiveMeBigNumbers extends Migration {
  async up(): Promise<void> {
    await this.createTable("big_numbers", (table) => {
      table.column("bank_balance", "decimal", { precision: 10, scale: 2 });
      table.column("big_bank_balance", "decimal", { precision: 15, scale: 2 });
      table.column("world_population", "decimal", { precision: 20 });
      table.column("my_house_population", "decimal", { precision: 2 });
      table.column("value_of_e", "decimal");
    });
  }

  async down(): Promise<void> {
    await this.dropTable("big_numbers");
  }
}
