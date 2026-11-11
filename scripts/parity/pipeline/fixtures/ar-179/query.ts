import { Book } from "./models.js";
export default Book.where({ rating: new Number(0) }).order({ id: "asc" });
