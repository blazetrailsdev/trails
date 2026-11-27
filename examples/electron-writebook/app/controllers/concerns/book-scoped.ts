import { defineModule, included } from "@blazetrails/activesupport";
import type { ActionController } from "@blazetrails/actionpack";
import { Book } from "../../models/book.ts";

export interface BookScopedHost extends ActionController.Base {
  book: Book;
}

export const BookScoped = defineModule(
  {
    [included](base: typeof ActionController.Base): void {
      base.beforeAction(":setBook");
    },
  },
  undefined,
  {
    async setBook(this: BookScopedHost): Promise<void> {
      this.book = await Book.accessableOrPublished().find(this.params.get("book_id"));
    },

    async ensureEditable(this: BookScopedHost): Promise<void> {
      if (!(await this.book.isEditable())) await this.head(":forbidden");
    },
  },
);
