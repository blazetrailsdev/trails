import { Migration } from "@blazetrails/activerecord";
import { TopLevel } from "@blazetrails/activesupport";

export class CreateActiveStorageVariantRecords extends Migration.get(6.0) {
  async change(): Promise<void> {
    if (!(await this.tableExists("active_storage_blobs"))) return;

    const blobsPrimaryKeyType = await this.blobsPrimaryKeyType();
    await this.createTable(
      "active_storage_variant_records",
      { id: this.primaryKeyType(), ifNotExists: true },
      (t) => {
        t.belongsTo("blob", { null: false, index: false, type: blobsPrimaryKeyType });
        t.string("variation_digest", { null: false });

        t.index(["blob_id", "variation_digest"], {
          name: "index_active_storage_variant_records_uniqueness",
          unique: true,
        });
        t.foreignKey("active_storage_blobs", { column: "blob_id" });
      },
    );
  }

  /** @internal */
  private primaryKeyType(): string {
    const config = TopLevel.Trails!.configuration!.generators();
    return (config.options.get(config.orm!())!.primaryKeyType as string | null) || "primary_key";
  }

  /** @internal */
  private async blobsPrimaryKeyType(): Promise<string> {
    const connection = await this.connection;
    const pkeyName = await connection.primaryKey("active_storage_blobs");
    const pkeyColumn = (await connection.columns("active_storage_blobs")).find(
      (c) => c.name === pkeyName,
    )!;
    return pkeyColumn.isBigint() ? "bigint" : pkeyColumn.type!;
  }
}
