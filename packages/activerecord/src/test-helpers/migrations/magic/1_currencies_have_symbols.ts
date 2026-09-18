import { Migration } from "../../../migration.js";

export class CurrenciesHaveSymbols extends Migration {
  async up(): Promise<void> {
    await this.addColumn("currencies", "symbol", "string", { default: "€" });
  }

  async down(): Promise<void> {
    await this.removeColumn("currencies", "symbol");
  }
}
