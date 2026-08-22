import { Book } from "./models.js";
const ids = Book.where({ status: "active" })
  .select("id")
  .arel()
  .union(Book.where({ status: "featured" }).select("id").arel());
export default Book.where(Book.arelTable.get("id").in(ids)).order({ id: "asc" });
