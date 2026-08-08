import { Book } from "./models.js";

export default Book.all()
  .includes("author")
  .where("authors.name = ?", "Rails")
  .references("author");
