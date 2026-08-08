import { Book } from "./models.js";

export default Book.where(Book.arelTable.get("title").matches("%rails%"));
