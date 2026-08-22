import { Book } from "./models.js";
const q1 = Book.where({ status: "active" }).arel();
const q2 = Book.where({ status: "featured" }).arel();
export default Book.from(q1.union(q2).as("all_books")).select("all_books.*").order("all_books.id");
