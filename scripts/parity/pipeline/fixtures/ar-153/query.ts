import { Author, Book } from "./models.js";
const joinSrc = Book.arelTable
  .join(Author.arelTable)
  .on(
    Book.arelTable
      .get("author_id")
      .eq(Author.arelTable.get("id"))
      .and(Author.arelTable.get("active").eq(1)),
  )
  .joinSources();
export default Book.joins(...joinSrc).select("books.*, authors.name AS author_name");
