import { Book } from "./models.js";
export default Book.select("author_id, COUNT(*) AS cnt")
  .group("author_id")
  .having("cnt > 2")
  .order("cnt DESC");
