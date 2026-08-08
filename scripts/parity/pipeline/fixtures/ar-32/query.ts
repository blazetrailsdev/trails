import { Book } from "./models.js";

export default Book.all().inOrderOf("status", ["published", "draft", "archived"]);
