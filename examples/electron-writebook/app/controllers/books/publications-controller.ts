import type { Parameters } from "@blazetrails/actionpack";
import { include, type Included } from "@blazetrails/activesupport";
import { ApplicationController } from "../application-controller.ts";
import { BookScoped } from "../concerns/book-scoped.ts";
import type { Book } from "../../models/book.ts";

// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging
export interface PublicationsController extends Included<typeof BookScoped> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class PublicationsController extends ApplicationController {
  declare book: Book;

  static {
    include(this, BookScoped);

    this.beforeAction(":ensureEditable", { only: ["edit", "update"] });
  }

  async show(): Promise<void> {}

  async edit(): Promise<void> {}

  async update(): Promise<void> {
    await this.book.updateBang(this.bookParams());
    await this.redirectTo(this.bookSlugUrl(this.book));
  }

  private bookParams(): Parameters {
    return (this.params.require("book") as Parameters).permit("published", "slug");
  }
}
