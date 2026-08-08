import { Author } from "./models.js";
export default Author.joins("publishedBooks")
  .where("published_books.title LIKE ?", "%Rails%")
  .select("authors.*, COUNT(published_books.id) AS book_count")
  .group("authors.id");
