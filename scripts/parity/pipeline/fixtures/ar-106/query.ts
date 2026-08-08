import { Book } from "./models.js";

export default Book.order({ author_id: "asc", title: "desc" });
