import { Book } from "./models.js";

export default Book.joins("author").group("authors.name").select("authors.name, COUNT(*) AS c");
