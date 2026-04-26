import { Author } from "./models.js";

export default Author.joins("books")
  .select("authors.*, COUNT(books.id) AS books_count")
  .group("authors.id");
