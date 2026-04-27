import { Nodes } from "@blazetrails/arel";
import { Book } from "./models.js";
export default Book.select(
  new Nodes.Multiplication(Book.arelTable.get("pages"), 2).as("double_pages"),
  Book.arelTable.get("id"),
)
  .where(Book.arelTable.get("pages").gt(0))
  .order({ id: "asc" })
  .limit(5);
