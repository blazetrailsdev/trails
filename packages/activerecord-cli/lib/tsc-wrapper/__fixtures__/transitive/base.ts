export class Model {
  [key: string]: unknown;
  constructor(_attrs?: Record<string, unknown>) {}
  static attribute(_name: string, _type: string): void {}
}
export class Base extends Model {}
