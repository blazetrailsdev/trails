import { Book } from "./models.js";

export default Book.joins("author")
  .where({ author: { name: "Alice" } })
  .order("authors.id");
