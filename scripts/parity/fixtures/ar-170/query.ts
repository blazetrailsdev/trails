import { Book } from "./models.js";
import { Range } from "@blazetrails/activerecord";
export default Book.where({ rating: new Range(3.5, 5.0) }).order({ id: "asc" });
