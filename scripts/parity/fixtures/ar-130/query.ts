import { sql } from "@blazetrails/arel";
import { Author } from "./models.js";

export default Author.joins("books")
  .joins("INNER JOIN reviews ON reviews.book_id = books.id")
  .where("reviews.rating >= 4")
  .group("authors.id, authors.name")
  .select(
    "authors.id, authors.name, COUNT(DISTINCT books.id) AS book_count, AVG(reviews.rating) AS avg_rating",
  )
  .having("COUNT(DISTINCT books.id) >= 2")
  .order(sql("avg_rating DESC"))
  .limit(5);
