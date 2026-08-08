import { Book } from "./models.js";

export default Book.optimizerHints("SeqScan(books)").where({ active: true });
