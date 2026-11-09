import { Simple } from "./tag/simple.js";
import type { Parents } from "./tag/parents.js";

export { Simple } from "./tag/simple.js";
export { Rfc4646 } from "./tag/rfc4646.js";

let implementationStore: TagImplementation | undefined;

export interface TagImplementation {
  tag(...tag: string[]): Parents | null;
}

export function implementation(): TagImplementation {
  implementationStore ??= Simple;
  return implementationStore;
}

export function setImplementation(value: TagImplementation): void {
  implementationStore = value;
}

export function tag(tag: string): Parents | null {
  return implementation().tag(tag);
}
