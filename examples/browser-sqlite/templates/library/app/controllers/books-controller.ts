import { Author } from "../models/author.ts";
import { ApplicationController } from "./application-controller.ts";

export class BooksController extends ApplicationController {
  async index(): Promise<void> {
    const author = await Author.find(this.params.expect("author_id"));
    await this.render({ json: await author.books.order("published_year").toArray() });
  }

  async create(): Promise<void> {
    const author = await Author.find(this.params.expect("author_id"));
    const book = author.books.build(
      this.params.expect({ book: ["title", "isbn", "published_year"] }),
    );
    if (await book.save()) await this.render({ json: book, status: ":created" });
    else await this.render({ json: { errors: book.errors }, status: ":unprocessable_content" });
  }
}
