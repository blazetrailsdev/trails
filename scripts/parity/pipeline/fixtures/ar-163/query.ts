import { Nodes } from "@blazetrails/arel";
import { Book } from "./models.js";
export default Book.select(
  new Nodes.Count([Book.arelTable.get("id")]).as("book_count"),
  Book.arelTable.get("author_id"),
)
  .group("author_id")
  .having(new Nodes.Count([Book.arelTable.get("id")]).gt(2));
