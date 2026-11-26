import { Author } from "../models/author.ts";
import { ApplicationController } from "./application-controller.ts";

export class AuthorsController extends ApplicationController {
  async index(): Promise<void> {
    await this.render({ json: await Author.includes("books").order("name").toArray() });
  }

  async show(): Promise<void> {
    const author = await Author.find(this.params.expect("id"));
    await this.render({ json: { ...author.asJson(), books: await author.books.toArray() } });
  }

  async create(): Promise<void> {
    const author = new Author(this.params.expect({ author: ["name", "born"] }));
    if (await author.save()) await this.render({ json: author, status: ":created" });
    else await this.render({ json: { errors: author.errors }, status: ":unprocessable_content" });
  }
}
