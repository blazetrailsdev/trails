import { Book } from "./models.js";

export default Book.joins(":author", ":reviews");
