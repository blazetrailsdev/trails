import type { Parameters } from "@blazetrails/actionpack";
import { ApplicationController } from "./application-controller.ts";
import { Book } from "../models/book.ts";
import { User } from "../models/user.ts";
import { Current } from "../models/current.ts";
import type { Leaf } from "../models/leaf.ts";

export class BooksController extends ApplicationController {
  declare books: Book[];
  declare book: Book;
  declare leaves: Leaf[];
  declare users: User[];

  static {
    this.allowUnauthenticatedAccess({ only: ["index", "show"] });

    this.beforeAction(":ensureIndexIsNotEmpty", { only: "index" });
    this.beforeAction(":setBook", { only: ["show", "edit", "update", "destroy"] });
    this.beforeAction(":setUsers", { only: ["new", "edit"] });
    this.beforeAction(":ensureEditable", { only: ["edit", "update", "destroy"] });
  }

  async index(): Promise<void> {
    this.books = (await Book.accessableOrPublished().ordered().toArray()) as Book[];
  }

  async new(): Promise<void> {
    this.book = new Book();
  }

  async create(): Promise<void> {
    const book = (await Book.createBang(this.bookParams())) as Book;
    await this.updateAccesses(book);

    await this.redirectTo(this.bookSlugUrl(book));
  }

  async show(): Promise<void> {
    this.leaves = (await this.book.leaves
      .active()
      .withLeafables()
      .positioned()
      .toArray()) as Leaf[];
    for (const leaf of this.leaves) leaf.association("book").target = this.book;
  }

  async edit(): Promise<void> {}

  async update(): Promise<void> {
    await this.book.update(this.bookParams());
    await this.updateAccesses(this.book);
    if (this.params.get("remove_cover") === "true") await this.removeCover();

    await this.redirectTo(this.bookSlugUrl(this.book));
  }

  async destroy(): Promise<void> {
    await this.book.destroy();

    await this.redirectTo(this.rootUrl());
  }

  private async setBook(): Promise<void> {
    this.book = await Book.accessableOrPublished().find(this.params.get("id"));
  }

  private async setUsers(): Promise<void> {
    this.users = (await User.active().ordered().toArray()) as User[];
  }

  private async ensureEditable(): Promise<void> {
    if (!(await this.book.isEditable())) await this.head(":forbidden");
  }

  private async ensureIndexIsNotEmpty(): Promise<void> {
    if (!this.isSignedIn() && !(await Book.published().isAny())) {
      await this.requireAuthentication();
    }
  }

  private bookParams(): Parameters {
    return this.uploadedFilesOnly(
      this.params
        .require("book")
        .permit("title", "subtitle", "author", "cover", "remove_cover", "everyone_access", "theme"),
      "cover",
    );
  }

  private async updateAccesses(book: Book): Promise<void> {
    const ids = (key: string) =>
      ((this.params.get(key) as string[] | undefined) ?? []).map((id) => Number(id));
    const editors = [Current.user!.id as number, ...ids("editor_ids")];
    const readers = [Current.user!.id as number, ...ids("reader_ids")];

    await book.updateAccess({ editors, readers });
  }

  private async removeCover(): Promise<void> {
    await this.book.cover.purge();
  }
}
