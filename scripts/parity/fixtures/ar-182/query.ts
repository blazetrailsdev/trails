import { Book } from "./models.js";
const ids = Book.where({ status: "active" })
  .select("id")
  .toArel()
  .union(Book.where({ status: "featured" }).select("id").toArel());
export default Book.where(Book.arelTable.get("id").in(ids)).order({ id: "asc" });
