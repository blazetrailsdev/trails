import { Book } from "./models.js";

export default Book.where().not({ status: "draft", active: false });
