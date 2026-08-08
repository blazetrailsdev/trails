import { sql } from "@blazetrails/arel";
import { Book } from "./models.js";
export default Book.group(sql("DATE(created_at)"))
  .select(sql("DATE(created_at) AS pub_date"), sql("COUNT(*) AS cnt"))
  .order(sql("pub_date"));
