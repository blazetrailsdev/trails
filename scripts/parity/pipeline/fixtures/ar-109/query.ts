import { Book } from "./models.js";

export default Book.where(Book.arelTable.get("status").notIn(["draft", "archived"]));
