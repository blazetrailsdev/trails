import { Book } from "./models.js";

export default Book.all().preload("reviews").where({ active: true });
