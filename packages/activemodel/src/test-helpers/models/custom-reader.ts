import { Model } from "../../index.js";

export class CustomReader extends Model {
  data: Record<string, unknown>;

  constructor(data: Record<string, unknown> = {}) {
    super();
    this.data = data;
  }

  override readAttributeForValidation(key: string): unknown {
    return this.data[key];
  }
}
