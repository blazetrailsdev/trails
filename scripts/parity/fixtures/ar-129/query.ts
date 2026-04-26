import { Nodes } from "@blazetrails/arel";
import { Book } from "./models.js";

export default Book.select(
  new Nodes.NamedFunction("COALESCE", [
    Book.arelTable.get("subtitle"),
    Book.arelTable.get("title"),
  ]).as("display_title"),
  Book.arelTable.get("id"),
)
  .order({ id: "asc" })
  .limit(5);
