import { Migration } from "@blazetrails/activerecord";
import { ActiveStorage } from "../../active-storage.js";

export class AddServiceNameToActiveStorageBlobs extends Migration.get(6.0) {
  async up(): Promise<void> {
    if (!(await this.tableExists("active_storage_blobs"))) return;

    if (!(await this.columnExists("active_storage_blobs", "service_name"))) {
      await this.addColumn("active_storage_blobs", "service_name", "string");

      let configuredService: string | null;
      if ((configuredService = ActiveStorage.Blob!.service!.name) != null) {
        await ActiveStorage.Blob!.unscoped().updateAll({ service_name: configuredService });
      }

      await this.changeColumn("active_storage_blobs", "service_name", "string", { null: false });
    }
  }

  async down(): Promise<void> {
    if (!(await this.tableExists("active_storage_blobs"))) return;

    await this.removeColumn("active_storage_blobs", "service_name");
  }
}
