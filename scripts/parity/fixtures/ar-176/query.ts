import { Book } from "./models.js";
export default Book.where({ rating: 4.0 }).order({ id: "asc" });
