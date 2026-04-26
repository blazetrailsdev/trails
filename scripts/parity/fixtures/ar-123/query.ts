import { Book } from "./models.js";

export default Book.whereNot({ author_id: null });
