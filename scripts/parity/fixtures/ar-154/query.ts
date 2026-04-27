import { Nodes } from "@blazetrails/arel";
import { Book } from "./models.js";
export default Book.group(new Nodes.NamedFunction("LENGTH", [Book.arelTable.get("title")]))
  .select("LENGTH(title) AS title_length, COUNT(*) AS cnt")
  .order("title_length");
