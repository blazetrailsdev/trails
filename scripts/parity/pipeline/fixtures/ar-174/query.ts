import { Book } from "./models.js";
import { Range } from "@blazetrails/activerecord";
export default Book.where({ rating: new Range(new Number(3), new Number(5), true) }).order({
  id: "asc",
});
