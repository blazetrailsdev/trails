import { Book } from "./models.js";

export default Book.all()
  .with({ recent_books: Book.where("created_at > '2020-01-01'") })
  .from("recent_books")
  .select("recent_books.*");
