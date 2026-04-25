import { Book } from "./models.js";

export default Book.order({ title: "asc", id: "desc" });
