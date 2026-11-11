import { Book } from "./models.js";
export default Book.where({ rating: [3.5, new Number(4), 4.5] }).order({ id: "asc" });
