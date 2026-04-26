import { Book } from "./models.js";

export default Book.joins("reviews")
  .where({ reviews: { rating: 5 } })
  .select("books.*, reviews.rating");
