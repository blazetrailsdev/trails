import { Book } from "./models.js";

export default Book.where(Book.arelTable.get("pages").between({ begin: 100, end: 500 }));
