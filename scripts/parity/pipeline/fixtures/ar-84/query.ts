import { Book } from "./models.js";

export default Book.all().createWith({ active: true }).where({ title: "Moby Dick" });
