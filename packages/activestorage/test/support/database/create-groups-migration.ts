import { Migration } from "@blazetrails/activerecord";

export class ActiveStorageCreateGroups extends Migration.get(6.0) {
  async change(): Promise<void> {
    await this.createTable("groups", () => {});
  }
}
