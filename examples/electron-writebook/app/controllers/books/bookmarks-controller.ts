import { include, isPresent, type Included } from "@blazetrails/activesupport";
import { ApplicationController } from "../application-controller.ts";
import { BookScoped } from "../concerns/book-scoped.ts";
import type { Book } from "../../models/book.ts";
import type { Leaf } from "../../models/leaf.ts";

// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging
export interface BookmarksController extends Included<typeof BookScoped> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class BookmarksController extends ApplicationController {
  declare book: Book;
  leaf: Leaf | null = null;

  static {
    this.allowUnauthenticatedAccess();

    include(this, BookScoped);
  }

  async show(): Promise<void> {
    if (isPresent(this.lastReadLeafId())) {
      this.leaf = await this.book.leaves.active().findBy({ id: this.lastReadLeafId() });
      if (this.leaf) this.leaf.association("book").target = this.book;
    }
  }

  private lastReadLeafId(): string | undefined {
    return this.cookies().get(`reading_progress_${this.book.id}`) as string | undefined;
  }
}
