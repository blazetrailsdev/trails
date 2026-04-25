import { Range } from "@blazetrails/activerecord";
import { Book } from "./models.js";

export default Book.all()
  .createWith({ status: "active" })
  .where({ id: new Range(1, 5) });
