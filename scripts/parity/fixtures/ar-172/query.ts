import { Nodes } from "@blazetrails/arel";
import { Book } from "./models.js";
export default Book.order(
  new Nodes.NamedFunction("LENGTH", [Book.arelTable.get("title")]).desc(),
).limit(5);
