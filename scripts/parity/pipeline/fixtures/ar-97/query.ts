import { Book } from "./models.js";

export default Book.where({ status: "active" }).or(Book.where({ status: "featured" }));
