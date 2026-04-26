import { Range } from "@blazetrails/activerecord";
import { Book } from "./models.js";

export default Book.where({ pages: new Range(100, 300) });
