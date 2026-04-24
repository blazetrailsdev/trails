import { Book } from "./models.js";

export default Book.all().eagerLoad("author").limit(10);
