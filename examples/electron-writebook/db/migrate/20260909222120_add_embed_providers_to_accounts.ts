import { Migration } from "@blazetrails/activerecord";

export class AddEmbedProvidersToAccounts extends Migration.get(8.0) {
  async change(): Promise<void> {
    await this.addColumn("accounts", "embed_providers", "text");
  }
}
