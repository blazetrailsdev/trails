import { include, type Included } from "@blazetrails/activesupport";
import { merge } from "@blazetrails/ruby-compat";
import type { CollectionProxy, Relation } from "@blazetrails/activerecord";
import { ApplicationRecord } from "./application-record.ts";
import { Accessable, type ClassMethods as AccessableClassMethods } from "./book/accessable.ts";
import { Sluggable } from "./book/sluggable.ts";
import type { Access } from "./access.ts";
import type { Leaf } from "./leaf.ts";
import type { Leafable } from "./leafable.ts";

export const THEMES = ["black", "blue", "green", "magenta", "orange", "violet", "white"] as const;

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Book extends Included<typeof Accessable>, Included<typeof Sluggable> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Book extends ApplicationRecord {
  declare title: string;
  declare subtitle: string | null;
  declare author: string | null;
  declare published: boolean;
  declare slug: string;
  declare everyone_access: boolean;
  declare theme: (typeof THEMES)[number];
  declare leaves: CollectionProxy<Leaf> & {
    active(): Relation<Leaf> & { positioned(): Relation<Leaf> };
  };
  declare accesses: CollectionProxy<Access>;
  declare cover: { isAttached(): boolean; purge(): Promise<void> };

  declare static published: () => Relation<Book>;
  declare static ordered: () => Relation<Book>;
  declare static withEveryoneAccess: () => Relation<Book>;

  declare static accessableOrPublished: (typeof AccessableClassMethods)["accessableOrPublished"];
  declare static accessableOrPublishedBooks: (typeof AccessableClassMethods)["accessableOrPublishedBooks"];

  static {
    include(this, Accessable);
    include(this, Sluggable);

    this.hasMany("leaves", { dependent: "destroy" });
    this.hasOneAttached("cover", { dependent: "purge_later" });

    this.scope("ordered", function () {
      return this.order("title");
    });
    this.scope("published", function () {
      return this.where({ published: true });
    });

    this.enum("theme", Object.fromEntries(THEMES.map((t) => [t, t])), {
      suffix: true,
      default: "blue",
    });
  }

  async press(leafable: Leafable, leafParams: Record<string, unknown>): Promise<Leaf> {
    return await this.leaves.createBang(merge(leafParams, { leafable }));
  }

  async markable(): Promise<string> {
    const leaves = await this.leaves.active().positioned().toArray();
    const parts: string[] = [];
    for (const it of leaves) parts.push(await (await it.leafable).markable());
    return parts.join("\n\n");
  }
}
