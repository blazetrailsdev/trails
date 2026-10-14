import { Conversion, Naming } from "@blazetrails/activemodel";
import { extend, include, isPresent } from "@blazetrails/activesupport";
import { rbInspect, Struct } from "@blazetrails/ruby-compat";

export class Customer extends Struct.new("name", "id") {
  declare name: string;
  declare id: number | null;

  static {
    extend(this, Naming);
    include(this, Conversion);
  }

  toXml(options: { builder?: { name(name: string): unknown } } = {}): unknown {
    if (options.builder) {
      return options.builder.name(this.name);
    } else {
      return `<name>${this.name}</name>`;
    }
  }

  toJs(_options: Record<string, unknown> = {}): string {
    return `name: ${rbInspect(this.name)}`;
  }
  toText = this.toJs;

  errors(): unknown[] {
    return [];
  }

  isPersisted(): boolean {
    return isPresent(this.id);
  }

  cacheKey(): string {
    return `${this.name}/${this.id}`;
  }
}
