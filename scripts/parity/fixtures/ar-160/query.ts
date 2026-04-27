import { Nodes } from "@blazetrails/arel";
import { Book } from "./models.js";
export default Book.select(
  new Nodes.Sum([Book.arelTable.get("pages")]).as("total_pages"),
  Book.arelTable.get("author_id"),
)
  .group("author_id")
  .having(new Nodes.Sum([Book.arelTable.get("pages")]).gt(1000));
