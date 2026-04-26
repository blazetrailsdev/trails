import { sql } from "@blazetrails/arel";
import { Book, Review } from "./models.js";

export default Book.all()
  .with({
    avg_ratings: Review.select("book_id", sql("ROUND(AVG(rating), 1) AS avg_score")).group(
      "book_id",
    ),
  })
  .joins("INNER JOIN avg_ratings ON avg_ratings.book_id = books.id")
  .where("avg_ratings.avg_score >= 4")
  .select("books.id, books.title, avg_ratings.avg_score")
  .order("avg_ratings.avg_score DESC");
