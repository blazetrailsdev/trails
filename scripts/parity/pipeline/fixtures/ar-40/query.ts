import { Range } from "@blazetrails/activerecord";
import { Book } from "./models.js";

export default Book.where({ id: new Range(5, null) });
