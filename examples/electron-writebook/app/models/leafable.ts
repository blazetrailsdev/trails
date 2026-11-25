import { defineModule, extend, included } from "@blazetrails/activesupport";
import { ModelName } from "@blazetrails/activemodel";
import type { Base } from "@blazetrails/activerecord";
import type { Book } from "./book.ts";
import type { Edit } from "./edit.ts";
import type { Leaf } from "./leaf.ts";

export const TYPES = ["Page", "Section", "Picture"];

export interface Leafable extends Base {
  leaf: Promise<Leaf | null>;
  book: Promise<Book | null>;
  edit: Promise<Edit | null>;
  title(): Promise<string>;
  owningBook(): Promise<Book | null>;
  searchableContent(): Promise<string | null>;
  markable(): Promise<string | null>;
  leafableName(): string;
}

export const ClassMethods = {
  leafableName(this: typeof Base & { _leafableName?: string }): string {
    if (!Object.hasOwn(this, "_leafableName")) {
      this._leafableName = new ModelName(this).singular;
    }
    return this._leafableName!;
  },
};

export const Leafable = defineModule({
  [included](base: typeof Base): void {
    extend(base, ClassMethods);

    base.hasOne("leaf", { as: "leafable", inverseOf: "leafable", touch: true });
    base.hasOne("book", { through: "leaf" });
    base.hasOne("edit", { as: "leafable" });
  },

  async title(this: Leafable): Promise<string> {
    return (await this.leaf)!.title;
  },

  async owningBook(this: Leafable): Promise<Book | null> {
    return (await this.book) ?? (await (await (await this.edit)?.leaf)?.book) ?? null;
  },

  async searchableContent(this: Leafable): Promise<string | null> {
    return null;
  },

  leafableName(this: Leafable): string {
    return (this.constructor as unknown as { leafableName(): string }).leafableName();
  },
});
