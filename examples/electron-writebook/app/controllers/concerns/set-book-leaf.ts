import {
  defineModule,
  included,
  singularize,
  underscore,
  demodulize,
} from "@blazetrails/activesupport";
import type { ActionController } from "@blazetrails/actionpack";
import { Book } from "../../models/book.ts";
import type { Leaf } from "../../models/leaf.ts";

export interface SetBookLeafHost extends ActionController.Base {
  book: Book;
  leaf: Leaf;
  instanceName(): string;
  controllerLeafableName(): string;
}

export const SetBookLeaf = defineModule(
  {
    [included](base: typeof ActionController.Base): void {
      base.beforeAction(":setBook");
      base.beforeAction(":setLeaf", ":setLeafable", {
        only: ["show", "edit", "update", "destroy"],
      });
    },
  },
  undefined,
  {
    async setBook(this: SetBookLeafHost): Promise<void> {
      this.book = await Book.accessableOrPublished().find(this.params.get("book_id"));
    },

    async setLeaf(this: SetBookLeafHost): Promise<void> {
      this.leaf = await this.book.leaves.active().find(this.params.get("id"));
      this.leaf.association("book").target = this.book;
    },

    async setLeafable(this: SetBookLeafHost): Promise<void> {
      const leafable = await this.leaf.leafable;
      leafable.association("leaf").target = this.leaf;
      (this as unknown as Record<string, unknown>)[this.instanceName()] = leafable;
    },

    async ensureEditable(this: SetBookLeafHost): Promise<void> {
      if (!(await this.book.isEditable())) await this.head(":forbidden");
    },

    instanceName(this: SetBookLeafHost): string {
      return underscore(this.controllerLeafableName());
    },

    controllerLeafableName(this: SetBookLeafHost): string {
      return singularize(demodulize(this.constructor.name.replace("Controller", "")));
    },
  },
);
