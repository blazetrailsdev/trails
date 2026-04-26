import { Book } from "./models.js";

export default Book.where({ active: true }).order({ title: "asc" }).unscope("order");
