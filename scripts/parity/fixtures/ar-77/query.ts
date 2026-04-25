import { sql } from "@blazetrails/arel";
import { Book } from "./models.js";

export default Book.group("author_id").having(sql("COUNT(*) > 1"));
