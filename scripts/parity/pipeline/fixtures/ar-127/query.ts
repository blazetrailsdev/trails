import { Book } from "./models.js";

export default Book.joins("author").joins("reviews").where("reviews.rating > 3");
