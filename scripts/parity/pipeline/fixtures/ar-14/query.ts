import { Book } from "./models.js";

export default Book.all().includes("author").limit(10);
