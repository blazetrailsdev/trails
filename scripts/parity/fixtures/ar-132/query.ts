import { Book } from "./models.js";

export default Book.where({ status: "draft" })
  .where({ active: false })
  .order({ title: "asc" })
  .limit(100)
  .unscope("limit", "order")
  .rewhere({ status: "published" })
  .order({ id: "desc" })
  .limit(5);
