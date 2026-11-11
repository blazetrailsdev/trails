import { Book } from "./models.js";
import { Range } from "@blazetrails/activerecord";
export default Book.where({ rating: new Range(3.5, new Number(5)) }).order({ id: "asc" });
