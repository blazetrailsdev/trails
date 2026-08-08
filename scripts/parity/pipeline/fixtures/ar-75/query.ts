import { Book } from "./models.js";

export default Book.select(Book.arelTable.get("id"), Book.arelTable.get("title")).limit(3);
