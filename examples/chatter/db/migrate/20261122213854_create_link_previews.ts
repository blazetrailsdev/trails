import { Migration } from "@blazetrails/activerecord";

export class CreateLinkPreviews extends Migration.get(8.0) {
  async change(): Promise<void> {
    await this.createTable("link_previews", (t) => {
      t.references("message", { null: false, foreignKey: true });
      t.string("url", { null: false });
      t.string("title");
      t.text("description");
      t.string("image_url");
      t.string("site_name");

      t.timestamps();
    });
  }
}
