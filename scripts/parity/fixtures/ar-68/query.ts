import { sql } from "@blazetrails/arel";
import { Book } from "./models.js";

export default Book.select(sql("id, title")).limit(5);
