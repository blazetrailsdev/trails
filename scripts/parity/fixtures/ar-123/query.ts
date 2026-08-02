import { Book } from "./models.js";

export default Book.where().not({ author_id: null });
