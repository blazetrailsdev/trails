import { Author } from "./models.js";

export default Author.all().includes({ books: "reviews" }).limit(3);
