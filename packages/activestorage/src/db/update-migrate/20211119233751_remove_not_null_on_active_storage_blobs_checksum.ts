import { Migration } from "@blazetrails/activerecord";

export class RemoveNotNullOnActiveStorageBlobsChecksum extends Migration.get(6.0) {
  async change(): Promise<void> {
    if (!(await this.tableExists("active_storage_blobs"))) return;

    await this.changeColumnNull("active_storage_blobs", "checksum", true);
  }
}
