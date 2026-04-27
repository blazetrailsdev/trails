import { Author } from "./models.js";

export default Author.joins({ books: "reviews" })
  .select("authors.id, authors.name, COUNT(reviews.id) AS total_reviews")
  .group("authors.id, authors.name");
