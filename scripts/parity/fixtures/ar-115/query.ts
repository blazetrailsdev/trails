import { Author } from "./models.js";

export default Author.joins("books").group("authors.id").having("COUNT(books.id) >= 2");
