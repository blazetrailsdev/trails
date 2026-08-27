import { isPreventingWrites } from "../../core.js";

export interface ConnectionOwner {
  name: string;
  primaryClassQ(): boolean;
}

export class ConnectionDescriptor {
  private readonly _name: string;
  private readonly _primary: boolean;

  constructor(name: string, primary: boolean = false) {
    this._name = name;
    this._primary = primary;
  }

  get name(): string {
    return this.primaryClassQ() ? "ActiveRecord::Base" : this._name;
  }

  primaryClassQ(): boolean {
    return this._primary;
  }

  currentPreventingWrites(): boolean {
    return isPreventingWrites(this._name);
  }
}
