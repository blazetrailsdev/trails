import { Book, Review } from "./models.js";

export default Book.joins("reviews").where(Review.arelTable.get("rating").gteq(4));
