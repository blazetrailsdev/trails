import { Book } from "./models.js";

export default Book.order({ id: "asc" }).order({ title: "desc" });
