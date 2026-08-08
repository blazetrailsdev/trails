import { Nodes, sql } from "@blazetrails/arel";
import { Book, Review } from "./models.js";
const sub = Review.select("book_id", sql("AVG(rating) AS avg_r"))
  .group("book_id")
  .toArel()
  .as("sub");
const join = new Nodes.InnerJoin(
  sub,
  new Nodes.On(sub.get("book_id").eq(Book.arelTable.get("id"))),
);
export default Book.joins(join).select("books.*, sub.avg_r");
