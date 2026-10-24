import { aryDeleteIf, rbObjIsKindOf } from "@blazetrails/ruby-compat";
import { Chronic } from "./namespaces.js";
import type { Tag } from "./tag.js";

type TagClass<T> = abstract new (...args: never[]) => T;

export class Token {
  word: string;
  tags: Tag[];

  constructor(word: string) {
    this.word = word;
    this.tags = [];
  }

  tag(newTag: Tag): Tag[] {
    this.tags.push(newTag);
    return this.tags;
  }

  untag(tagClass: TagClass<unknown>): Tag[] {
    return aryDeleteIf(this.tags, (m) => rbObjIsKindOf(m, tagClass));
  }

  isTagged(): boolean {
    return this.tags.length > 0;
  }

  getTag<T>(tagClass: TagClass<T>): T | undefined {
    return this.tags.find((m) => rbObjIsKindOf(m, tagClass)) as T | undefined;
  }

  toString(): string {
    return (this.word = this.word + "(" + this.tags.join(", ") + ") ");
  }

  inspect(): string {
    return this.toString();
  }
}

Chronic.Token = Token;
