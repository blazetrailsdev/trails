import { include, parameterize, presence, type Included } from "@blazetrails/activesupport";
import type { CollectionProxy, Relation } from "@blazetrails/activerecord";
import { ApplicationRecord } from "./application-record.ts";
import type { Edit } from "./edit.ts";
import { Editable } from "./leaf/editable.ts";
import {
  Positionable,
  type ClassMethods as PositionableClassMethods,
} from "./concerns/positionable.ts";
import { Searchable, type ClassMethods as SearchableClassMethods } from "./leaf/searchable.ts";
import { TYPES, type Leafable } from "./leafable.ts";
import type { Book } from "./book.ts";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Leaf
  extends Included<typeof Editable>, Included<typeof Positionable>, Included<typeof Searchable> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Leaf extends ApplicationRecord {
  declare title: string;
  declare status: "active" | "trashed";
  declare position_score: number;
  declare book_id: number;
  declare leafable_type: string;
  declare book: Promise<Book>;
  declare leafable: Promise<Leafable>;
  declare isTrashed: () => boolean;
  declare trashedBang: () => Promise<void>;
  declare edits: CollectionProxy<Edit> & {
    revision(): CollectionProxy<Edit>;
    trash(): CollectionProxy<Edit>;
    before(edit: Edit): Relation<Edit>;
    after(edit: Edit): Relation<Edit>;
  };

  declare static active: () => Relation<Leaf>;
  declare static positioned: () => Relation<Leaf>;
  declare static withLeafables: () => Relation<Leaf>;
  declare static favoringTitle: () => Relation<Leaf>;

  declare static positionedWithin: (typeof PositionableClassMethods)["positionedWithin"];
  declare static reindexAll: (typeof SearchableClassMethods)["reindexAll"];
  declare static sanitizeQuerySyntax: (typeof SearchableClassMethods)["sanitizeQuerySyntax"];
  declare static search: (typeof SearchableClassMethods)["search"];
  declare static withSearchResultsFor: (typeof SearchableClassMethods)["withSearchResultsFor"];

  static {
    include(this, Editable);
    include(this, Positionable);
    include(this, Searchable);

    this.belongsTo("book", { touch: true });
    this.delegatedType("leafable", { types: TYPES, dependent: "destroy" });
    this.positionedWithin("book", { association: "leaves", filter: "active" });

    this.enum("status", { active: "active", trashed: "trashed" }, { default: "active" });

    this.scope("withLeafables", function () {
      return this.includes("leafable");
    });
  }

  async searchableContent(): Promise<string | null> {
    return await (await this.leafable).searchableContent();
  }

  slug(): string {
    return presence(parameterize(this.title)) ?? "-";
  }
}
