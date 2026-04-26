import { sql } from "@blazetrails/arel";
import { Book } from "./models.js";

export default Book.order(sql("CASE WHEN status = 'featured' THEN 0 ELSE 1 END"));
