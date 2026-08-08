import { Book } from "./models.js";
import { Range } from "@blazetrails/activerecord";
export default Book.where({ rating: new Range(3.0, 5.0, true) }).order({ id: "asc" });
