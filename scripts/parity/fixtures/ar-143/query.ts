import { Author } from "./models.js";

export default Author.leftOuterJoins({ books: "reviews" })
  .select("authors.id, authors.name, COUNT(reviews.id) AS review_count")
  .group("authors.id, authors.name");
