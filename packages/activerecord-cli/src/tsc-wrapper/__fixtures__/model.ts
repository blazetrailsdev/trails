export class Model {
  [key: string]: unknown;
  constructor(_attrs?: Record<string, unknown>) {}
  static attribute(_name: string, _type: string): void {}
  static hasMany(_name: string, _opts?: Record<string, unknown>): void {}
  static belongsTo(_name: string, _opts?: Record<string, unknown>): void {}
  static scope(_name: string, _fn: (...args: unknown[]) => unknown): void {}
}
export class Base extends Model {}
