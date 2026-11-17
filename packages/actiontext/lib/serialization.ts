import { Concern, extend, type Extended } from "@blazetrails/activesupport";
import { ActionText } from "./action-text.js";

interface SerializationHost {
  prototype: { toHtml(): string };
  "new"(content: unknown): Promise<{ toHtml(): string }>;
}

function load(this: SerializationHost, content: unknown): unknown {
  if (content != null && content !== false) return this.new(content);
  return null;
}

/** @inventedArm then — PERMANENT */
function dump(this: SerializationHost, content: unknown): string | null | Promise<string | null> {
  if (content == null) {
    return null;
  } else if (content instanceof (this as unknown as abstract new () => { toHtml(): string })) {
    return content.toHtml();
  } else if (content instanceof ActionText.RichText!) {
    return content.body!.toHtml();
  } else {
    return this.new(content).then((content_) => content_.toHtml());
  }
}

const ClassMethods = { load, dump, _load: load };

function _dump(this: { constructor: unknown }, ..._args: unknown[]): string | null {
  return (this.constructor as { dump(content: unknown): string | null }).dump(this);
}

export const Serialization = { _dump } as Extended<typeof Concern> & {
  _dump: typeof _dump;
  ClassMethods: typeof ClassMethods;
};
extend(Serialization, Concern);
Serialization.ClassMethods = ClassMethods;
ActionText.Serialization = Serialization;
