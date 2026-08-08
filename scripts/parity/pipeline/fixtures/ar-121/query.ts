import { Book } from "./models.js";

export default Book.select(
  Book.arelTable.get("id"),
  Book.arelTable.get("title"),
  Book.arelTable.get("status"),
).where({ active: true });
