import { Book } from "./models.js";

export default Book.select("author_id").distinct().order({ author_id: "asc" });
