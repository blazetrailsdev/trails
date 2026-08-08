import { sql as arelSql } from "@blazetrails/arel";
import { Book } from "./models.js";

export default Book.where(arelSql("id > 5"));
