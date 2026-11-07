import { GlobalID } from "./global-id.js";

export class User {
  readonly name: string;

  constructor(name: string) {
    this.name = name;
  }

  toGlobalId(): GlobalID {
    return new GlobalID(`User#${this.name}`);
  }

  toGidParam(): string {
    return this.toGlobalId().toParam();
  }
}
