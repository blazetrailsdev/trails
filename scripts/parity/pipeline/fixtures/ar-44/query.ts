import { Book } from "./models.js";

export default Book.leftOuterJoins("author");
