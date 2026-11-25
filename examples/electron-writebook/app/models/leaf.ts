import {
  include,
  parameterize,
  presence,
  type Included,
  type SafeBuffer,
} from "@blazetrails/activesupport";
import type { CollectionProxy, Relation } from "@blazetrails/activerecord";
import { ApplicationRecord } from "./application-record.ts";
import type { Edit } from "./edit.ts";
import { Editable } from "./leaf/editable.ts";
import {
  Positionable,
  type ClassMethods as PositionableClassMethods,
  type PositionedWithin,
} from "./concerns/positionable.ts";
import { Searchable, type ClassMethods as SearchableClassMethods } from "./leaf/searchable.ts";
import { TYPES } from "./leafable.ts";
import type { Page } from "./page.ts";
import type { Picture } from "./picture.ts";
import type { Section } from "./section.ts";
import type { Book } from "./book.ts";

export interface LeafScopes {
  active(): LeafRelation;
  positioned(): LeafRelation;
  withLeafables(): LeafRelation;
  favoringTitle(): LeafRelation;
}

export type LeafRelation = Relation<Leaf> & LeafScopes;

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Leaf
  extends
    Included<typeof Editable>,
    Included<typeof Positionable>,
    Included<typeof Searchable>,
    PositionedWithin {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Leaf extends ApplicationRecord {
  declare title: string;
  declare status: "active" | "trashed";
  declare position_score: number;
  declare book_id: number;
  declare leafable_type: string;
  declare book: Promise<Book>;
  declare leafable: Promise<Page | Section | Picture>;
  declare isPage: () => boolean;
  declare isSection: () => boolean;
  declare isPicture: () => boolean;
  declare page: Promise<Page> | null;
  declare section: Promise<Section> | null;
  declare picture: Promise<Picture> | null;
  declare isTrashed: () => boolean;
  declare trashedBang: () => Promise<void>;
  declare edits: CollectionProxy<Edit>;

  declare static active: () => LeafRelation;
  declare static positioned: () => LeafRelation;
  declare static withLeafables: () => LeafRelation;
  declare static favoringTitle: () => LeafRelation;

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

  async searchableContent(): Promise<string | SafeBuffer | null> {
    return await (await this.leafable).searchableContent();
  }

  slug(): string {
    return presence(parameterize(this.title)) ?? "-";
  }
}
