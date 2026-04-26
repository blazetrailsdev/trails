import { Book } from "./models.js";

export default Book.whereNot({ status: "draft", active: false });
