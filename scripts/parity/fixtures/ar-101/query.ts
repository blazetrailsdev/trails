import { sql } from "@blazetrails/arel";
import { Book } from "./models.js";

export default Book.select(sql("books.*, COUNT(reviews.id) AS review_count"))
  .joins("LEFT JOIN reviews ON reviews.book_id = books.id")
  .group("books.id");
