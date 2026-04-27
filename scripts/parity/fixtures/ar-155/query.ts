import { Nodes } from "@blazetrails/arel";
import { Book } from "./models.js";
export default Book.select(
  new Nodes.Case(Book.arelTable.get("status"))
    .when("active")
    .then("yes")
    .when("draft")
    .then("maybe")
    .else("no")
    .as("is_visible"),
  Book.arelTable.get("id"),
)
  .order({ id: "asc" })
  .limit(5);
