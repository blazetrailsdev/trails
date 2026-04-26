import { Book } from "./models.js";

export default Book.where({ status: "draft" }).rewhere({ status: "published" });
