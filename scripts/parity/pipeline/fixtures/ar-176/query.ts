import { Book } from "./models.js";
export default Book.where({ rating: new Number(4) }).order({ id: "asc" });
