import { sql } from "@blazetrails/arel";
import { Book } from "./models.js";

export default Book.select("author_id", sql("COUNT(*) AS book_count"))
  .group("author_id")
  .having(sql("COUNT(*) > 2"));
