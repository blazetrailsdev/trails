import { Book } from "./models.js";

export default Book.where({ active: true }).annotate("find active books");
