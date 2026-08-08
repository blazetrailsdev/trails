import { Book } from "./models.js";

export default Book.where({ id: 1 }).readonly();
