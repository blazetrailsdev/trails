import { include, type Included } from "@blazetrails/activesupport";
import { ApplicationController } from "../application-controller.ts";
import { BookScoped } from "../concerns/book-scoped.ts";
import type { Book } from "../../models/book.ts";
import type { Leaf } from "../../models/leaf.ts";

// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging
export interface SearchesController extends Included<typeof BookScoped> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class SearchesController extends ApplicationController {
  declare book: Book;
  declare leaves: Leaf[];

  static {
    this.allowUnauthenticatedAccess();

    include(this, BookScoped);
  }

  async create(): Promise<void> {
    const active = this.book.leaves.active() as unknown as {
      search(terms: unknown): {
        favoringTitle(): { limit(n: number): { toArray(): Promise<Leaf[]> } };
      };
    };
    this.leaves = await active
      .search(this.params.get("search"))
      .favoringTitle()
      .limit(50)
      .toArray();
    for (const leaf of this.leaves) leaf.association("book").target = this.book;
  }
}
