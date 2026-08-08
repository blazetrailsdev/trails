import { Book } from "./models.js";
import { Range } from "@blazetrails/activerecord";
export default Book.where(Book.arelTable.get("pages").between(new Range(100, 300, true))).order({
  id: "asc",
});
