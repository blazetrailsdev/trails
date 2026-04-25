import { Book } from "./models.js";

export default Book.joins("author").where({ authors: { name: "Rails" } });
