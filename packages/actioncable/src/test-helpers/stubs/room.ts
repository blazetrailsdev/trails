import { GlobalID } from "./global-id.js";

export class Room {
  readonly id: unknown;
  readonly name: string;

  constructor(id: unknown, name = "Campfire") {
    this.id = id;
    this.name = name;
  }

  toGlobalId(): GlobalID {
    return new GlobalID(`Room#${this.id}-${this.name}`);
  }

  toGidParam(): string {
    return this.toGlobalId().toParam();
  }
}
