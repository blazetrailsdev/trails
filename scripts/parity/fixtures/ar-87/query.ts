import { Author, Book } from "./models.js";

const authors = Author.arelTable;
const books = Book.arelTable;
const joinSources = books
  .join(authors)
  .on(books.get("author_id").eq(authors.get("id"))).joinSources;

export default Book.joins(...joinSources);
