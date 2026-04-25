import { Book } from "./models.js";

export default Book.where({ id: 1 }).optimizerHints("USE_INDEX(books, idx_title)");
