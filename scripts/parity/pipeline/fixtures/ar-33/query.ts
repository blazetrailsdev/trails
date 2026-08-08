import { Book } from "./models.js";

export default Book.select(Book.arelTable.get("title").as("t"));
