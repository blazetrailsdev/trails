import { Author } from "./models.js";

export default Author.all().preload("books.reviews").limit(3);
