import { Book } from "./models.js";

export default Book.where(Book.arelTable.get("pages").gt(100));
