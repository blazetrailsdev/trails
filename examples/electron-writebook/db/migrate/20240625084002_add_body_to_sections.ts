import { Migration } from "@blazetrails/activerecord";

export class AddBodyToSections extends Migration.get(8.0) {
  async change(): Promise<void> {
    await this.changeTable("sections", (t) => {
      t.text("body");
    });

    await this.execute(
      "update sections set body = l.title from leaves l where l.leafable_id = sections.id and l.leafable_type = 'Section'",
    );
  }
}
