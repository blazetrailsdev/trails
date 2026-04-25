import { Book } from "./models.js";

export default Book.all()
  .with({ recent: Book.where("published_year >= ?", 2020) })
  .from("recent AS books");
