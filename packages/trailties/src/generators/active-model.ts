// Mirrors railties/lib/rails/generators/active_model.rb. Per-ORM subclasses
// override these methods to emit ORM-specific snippets that the scaffold
// controller template inlines.
export class ActiveModel {
  readonly name: string;
  constructor(name: string) {
    this.name = name;
  }
  static all(klass: string): string {
    return `${klass}.all`;
  }
  static find(klass: string, params?: string): string {
    return `${klass}.find(${params ?? ""})`;
  }
  static build(klass: string, params?: string): string {
    return params == null ? `${klass}.new` : `${klass}.new(${params})`;
  }
  save(): string {
    return `${this.name}.save`;
  }
  update(params?: string): string {
    return `${this.name}.update(${params ?? ""})`;
  }
  errors(): string {
    return `${this.name}.errors`;
  }
  destroy(): string {
    return `${this.name}.destroy!`;
  }
}
