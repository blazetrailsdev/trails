import { Author, Book } from "./models.js";
export default Book.where({ author: Author.where("authors.active = 1") }).order({ id: "asc" });
