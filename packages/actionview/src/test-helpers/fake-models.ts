import { Conversion, Naming, Translation } from "@blazetrails/activemodel";
import { isPresent } from "@blazetrails/activesupport";
import {
  extend,
  include,
  rbInspect,
  rbModConstSet,
  registerConstant,
  Struct,
  toS,
} from "@blazetrails/ruby-compat";

export class Comment {
  static {
    extend(this, Naming);
    include(this, Conversion);
  }

  id: unknown;
  postId: unknown;

  constructor(id: unknown = null, postId: unknown = null) {
    this.id = id;
    this.postId = postId;
  }

  toKey(): unknown[] | null {
    return this.id != null ? [this.id] : null;
  }

  save(): void {
    this.id = 1;
    this.postId = 1;
  }

  isPersisted(): boolean {
    return isPresent(this.id);
  }

  toParam(): string | null {
    return this.id == null ? null : String(this.id);
  }

  get name(): string {
    return this.id == null
      ? `new ${(this.constructor as typeof Comment).name.toLowerCase()}`
      : `${(this.constructor as typeof Comment).name.toLowerCase()} #${this.id}`;
  }

  relevances: unknown;

  setRelevancesAttributes(_attributes: unknown): void {}

  body: unknown;
}

export class Plane {
  private _toKey: unknown[] | null = null;

  toKey(): unknown[] | null {
    return this._toKey;
  }

  static get modelName(): { paramKey: string } {
    return { paramKey: "airplane" };
  }

  get modelName(): { paramKey: string } {
    return (this.constructor as typeof Plane).modelName;
  }

  save(): void {
    this._toKey = [1];
  }
}

class Book {
  static {
    extend(this, Naming);
    include(this, Conversion);
  }

  authorId: unknown = null;
  private _id: unknown = null;
  title: unknown = null;

  constructor({
    authorId = null,
    id = null,
    title = null,
  }: { authorId?: unknown; id?: unknown; title?: unknown } = {}) {
    this.authorId = authorId;
    this.title = title;
    this.id = id;
  }

  isPersisted(): boolean {
    return this.id.every((v) => v != null && v !== false);
  }

  get id(): unknown[] {
    return [this.authorId, this._id];
  }

  set id(id: unknown) {
    [this.authorId, this._id] = id == null ? [] : Array.isArray(id) ? id : [id];
  }
}
export const Cpk = { name: "Cpk" } as { name: string; Book: typeof Book };
registerConstant("Cpk", Cpk);
rbModConstSet(Cpk, "Book", Book);

export class Customer extends Struct.new("name", "id") {
  declare name: string;
  declare id: number | null;
  declare toText: Customer["toJs"];

  static {
    extend(this, Naming);
    include(this, Conversion);
  }

  toXml(options: { builder?: { name(name: string): unknown } } = {}): unknown {
    if (options.builder) {
      return options.builder.name(this.name);
    } else {
      return `<name>${this.name}</name>`;
    }
  }

  toJs(_options: Record<string, unknown> = {}): string {
    return `name: ${rbInspect(this.name)}`;
  }

  static {
    this.prototype.toText = this.prototype.toJs;
  }

  errors(): unknown[] {
    return [];
  }

  isPersisted(): boolean {
    return isPresent(this.id);
  }

  cacheKey(): string {
    return toS(this.name);
  }
}

export class BadCustomer extends Customer {}
export class GoodCustomer extends Customer {}

export class Post extends Struct.new(
  "title",
  "authorName",
  "body",
  "secret",
  "persisted",
  "writtenOn",
  "cost",
) {
  declare title: unknown;
  declare authorName: unknown;
  declare body: unknown;
  declare secret: unknown;
  declare persisted: unknown;
  declare writtenOn: unknown;
  declare cost: unknown;
  declare static humanAttributeName: (attribute: string) => string;

  static {
    extend(this, Naming);
    include(this, Conversion);
    extend(this, Translation);
  }

  isSecret(): unknown {
    return this.secret;
  }

  isPersisted(): unknown {
    return this.persisted;
  }

  author: unknown;
  setAuthorAttributes(_attributes: unknown): void {}

  comments: unknown;
  commentIds: unknown;
  setCommentsAttributes(_attributes: unknown): void {}

  tags: unknown;
  setTagsAttributes(_attributes: unknown): void {}
}
