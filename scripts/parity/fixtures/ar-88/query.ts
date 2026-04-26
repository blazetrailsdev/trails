import { Book } from "./models.js";

export default Book.select(Book.arelTable.get("title").as("book_title"), Book.arelTable.get("id"));
