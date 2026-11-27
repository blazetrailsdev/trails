import { Migration } from "@blazetrails/activerecord";

export class AddSingletonGuardToAccounts extends Migration.get(8.0) {
  async change(): Promise<void> {
    await this.addColumn("accounts", "singleton_guard", "integer", { default: 0, null: false });

    await this.upOnly(async () => {
      await this.execute(
        "UPDATE accounts SET singleton_guard = id WHERE id > (SELECT MIN(id) FROM accounts)",
      );
    });

    await this.addIndex("accounts", "singleton_guard", { unique: true });
  }
}
