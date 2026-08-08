import { Book } from "./models.js";
export default Book.select("author_id, COUNT(*) AS cnt, SUM(pages) AS total")
  .group("author_id")
  .having("total > 500")
  .order("total DESC");
