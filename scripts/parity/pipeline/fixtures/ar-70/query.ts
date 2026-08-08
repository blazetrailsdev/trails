import { Book } from "./models.js";

export default Book.order({ title: "desc" }).reorder({ id: "asc" });
