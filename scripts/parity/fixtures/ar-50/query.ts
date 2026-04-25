import { Book } from "./models.js";

export default Book.all().includes("author", "reviews").limit(5);
