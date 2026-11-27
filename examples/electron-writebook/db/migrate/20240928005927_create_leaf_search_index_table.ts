import { Migration } from "@blazetrails/activerecord";
import { Leaf } from "../../app/models/leaf.ts";

export class CreateLeafSearchIndexTable extends Migration.get(8.0) {
  async change(): Promise<void> {
    await this.createVirtualTable("leaf_search_index", "fts5", [
      "title",
      "content",
      "tokenize='porter'",
    ]);

    await Leaf.reindexAll();
  }
}
