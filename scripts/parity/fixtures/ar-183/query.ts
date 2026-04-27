import { Nodes } from "@blazetrails/arel";
import { Book } from "./models.js";
export default Book.order(
  new Nodes.Case(Book.arelTable.get("status"))
    .when("active")
    .then(1)
    .when("featured")
    .then(2)
    .else(3),
  Book.arelTable.get("id"),
).limit(5);
