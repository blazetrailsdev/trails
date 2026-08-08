import { Book, Review } from "./models.js";

const subquery = Review.select("book_id").where("rating > 4").arel();
export default Book.where(Book.arelTable.get("id").in(subquery));
