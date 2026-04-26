import { Book } from "./models.js";

export default Book.where({ active: true }).merge(Book.order({ title: "asc" }));
