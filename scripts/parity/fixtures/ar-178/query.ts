import { Nodes } from "@blazetrails/arel";
import { Book } from "./models.js";
export default Book.select(
  Book.arelTable.get("id"),
  new Nodes.Extract(Book.arelTable.get("created_at"), "year").as("yr"),
)
  .order(new Nodes.Extract(Book.arelTable.get("created_at"), "year").desc())
  .limit(5);
