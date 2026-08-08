import { Book } from "./models.js";

export default Book.joins("INNER JOIN authors ON authors.id = books.author_id").where(
  "authors.name = 'Alice'",
);
