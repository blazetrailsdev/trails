import { Book } from "./models.js";

export default Book.where(
  Book.arelTable.get("pages").gteq(200).and(Book.arelTable.get("pages").lteq(400)),
);
