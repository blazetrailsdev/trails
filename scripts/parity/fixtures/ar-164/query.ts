import { Nodes } from "@blazetrails/arel";
import { Book } from "./models.js";
export default Book.select(
  new Nodes.Max([Book.arelTable.get("pages")]).as("max_pages"),
  new Nodes.Min([Book.arelTable.get("pages")]).as("min_pages"),
  Book.arelTable.get("author_id"),
).group("author_id");
