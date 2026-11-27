import { Migration } from "@blazetrails/activerecord";

export class AddCustomStylesToAccount extends Migration.get(8.0) {
  async change(): Promise<void> {
    await this.addColumn("accounts", "custom_styles", "text");
  }
}
