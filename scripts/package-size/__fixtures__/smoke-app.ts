import { Base, Migration } from "@blazetrails/activerecord";
import "@blazetrails/activerecord/connection-adapters/sqlite3-adapter.js";
import "@blazetrails/activerecord/tasks/database-tasks.js";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";

class CreateSmoke extends Migration.Current {
  async change(): Promise<void> {
    await this.createTable("authors", (t) => {
      t.string("name");
    });
    await this.createTable("books", (t) => {
      t.string("title");
      t.integer("status", { default: 0 });
      t.references("author");
    });
  }
}

class Author extends Base {
  declare name: string;

  static {
    this.hasMany("books");
  }
}

class Book extends Base {
  declare title: string;
  declare status: string;
  declare author: Promise<Author>;

  static {
    this.belongsTo("author");
    this.enum("status", { proposed: 0, published: 1 });
  }
}

constSet(TopLevel, "Author", Author);
constSet(TopLevel, "Book", Book);

await Base.establishConnection({ adapter: "sqlite3", database: ":memory:" });
await new CreateSmoke().migrate("up");
const author = await Author.create({ name: "Ursula" });
await Book.create({ title: "The Dispossessed", status: "published", author });
const book = await Book.findBy({ title: "The Dispossessed" });
const owner = await book!.author;
console.log(JSON.stringify({ title: book!.title, status: book!.status, author: owner.name }));
