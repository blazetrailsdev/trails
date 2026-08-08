import { Book } from "./models.js";
export default Book.all()
  .annotate("finding active books")
  .optimizerHints("SeqScan(books)")
  .where({ active: true })
  .order({ id: "asc" });
