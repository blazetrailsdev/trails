import { sql } from "@blazetrails/arel";
import { Book } from "./models.js";

const ranked = Book.select(
  sql('"books".*'),
  sql("ROW_NUMBER() OVER (PARTITION BY author_id ORDER BY pages DESC) AS rn"),
)
  .toArel()
  .as("ranked");
export default Book.from(ranked).where("ranked.rn = 1").order("ranked.id");
