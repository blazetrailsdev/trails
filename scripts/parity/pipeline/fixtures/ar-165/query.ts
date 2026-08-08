import { Nodes } from "@blazetrails/arel";
import { Book } from "./models.js";
export default Book.select(
  new Nodes.Count([Book.arelTable.get("author_id")], true).as("distinct_authors"),
);
