import { Book } from "./models.js";

export default Book.from(Book.where({ active: true }), "books");
