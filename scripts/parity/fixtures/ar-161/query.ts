import { Nodes } from "@blazetrails/arel";
import { Book } from "./models.js";
export default Book.select(
  new Nodes.Extract(Book.arelTable.get("created_at"), "year").as("pub_year"),
  Book.arelTable.get("author_id"),
)
  .group("pub_year, author_id")
  .order("pub_year");
