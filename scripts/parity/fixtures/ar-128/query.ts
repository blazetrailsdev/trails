import { Book } from "./models.js";

export default Book.where({ active: true }).select("COUNT(*) AS total");
