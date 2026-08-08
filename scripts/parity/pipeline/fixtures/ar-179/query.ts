import { Book } from "./models.js";
export default Book.where({ rating: 0.0 }).order({ id: "asc" });
