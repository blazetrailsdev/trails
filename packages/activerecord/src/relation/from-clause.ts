export class FromClause {
  readonly value: any;
  readonly name: string | null;

  constructor(value: any = null, name: string | null = null) {
    this.value = value;
    this.name = name;
  }

  static empty(): FromClause {
    return EMPTY;
  }

  isEmpty(): boolean {
    return this.value == null;
  }

  merge(other: FromClause): FromClause {
    if (!other.isEmpty()) return other;
    return this;
  }

  equals(other: FromClause): boolean {
    return this.value === other.value && this.name === other.name;
  }
}

const EMPTY = new FromClause();
