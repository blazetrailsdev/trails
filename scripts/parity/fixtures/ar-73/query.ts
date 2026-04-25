import { Range } from "@blazetrails/activerecord";
import { Book } from "./models.js";

export default Book.whereNot({ id: new Range(1, 5) });
