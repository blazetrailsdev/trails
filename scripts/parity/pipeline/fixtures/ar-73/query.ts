import { Range } from "@blazetrails/activerecord";
import { Book } from "./models.js";

export default Book.where().not({ id: new Range(1, 5) });
