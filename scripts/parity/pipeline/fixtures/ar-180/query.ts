import { Book } from "./models.js";
export default Book.select(Book.arelTable.get("pages").as("p"), Book.arelTable.get("author_id"))
  .where(Book.arelTable.get("pages").gt(0))
  .order("p DESC")
  .limit(5);
