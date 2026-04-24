import { Book } from "./models.js";

export default Book.all().preload("author").limit(10);
