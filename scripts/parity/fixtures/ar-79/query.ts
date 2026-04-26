import { Book } from "./models.js";

export default Book.where({ active: true }).unscoped().order("title");
