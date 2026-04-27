import { Book } from "./models.js";
export default Book.where({ rating: [3.5, 4.0, 4.5] }).order({ id: "asc" });
