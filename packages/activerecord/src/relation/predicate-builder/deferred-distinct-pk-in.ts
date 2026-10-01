import type * as Arel from "@blazetrails/arel";
import { Nodes } from "@blazetrails/arel";

type DeferredIds = { ids(): Promise<unknown[]> };

type Pluckable = {
  pluck(...columnNames: string[]): Promise<unknown[]>;
  select(...fields: string[]): unknown;
};

/** @noRailsEquivalent PERMANENT */
export class DeferredPluck implements PromiseLike<unknown[]> {
  private plucked?: Promise<unknown[]>;

  /** @noRailsEquivalent PERMANENT */
  constructor(
    private readonly relation: Pluckable,
    private readonly columnNames: string[],
  ) {}

  /** @noRailsEquivalent PERMANENT */
  ids(): Promise<unknown[]> {
    return (this.plucked ??= this.relation.pluck(...this.columnNames));
  }

  /** @noRailsEquivalent PERMANENT */
  then<A = unknown[], B = never>(
    onfulfilled?: ((value: unknown[]) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): Promise<A | B> {
    return this.ids().then(onfulfilled, onrejected);
  }

  /** @noRailsEquivalent PERMANENT */
  in(left: Arel.Attribute | Nodes.Grouping): DeferredIdsIn {
    return new DeferredIdsIn(
      left,
      (this.relation.select(...this.columnNames) as { arel(): Nodes.Node }).arel(),
      [this],
    );
  }
}

/** @noRailsEquivalent PERMANENT */
export class DeferredIdsIn extends Nodes.In {
  constructor(
    attribute: Arel.Attribute | Nodes.Grouping,
    inlineSubquery: Nodes.Node,
    /** @noRailsEquivalent PERMANENT */
    readonly innerRelations: DeferredIds[],
  ) {
    super(attribute, inlineSubquery);
  }

  invert(): DeferredIdsNotIn {
    return new DeferredIdsNotIn(
      this.left as Arel.Attribute,
      this.right as Nodes.Node,
      this.innerRelations,
    );
  }
}

/** @noRailsEquivalent PERMANENT */
export class DeferredIdsNotIn extends Nodes.NotIn {
  constructor(
    attribute: Arel.Attribute,
    inlineSubquery: Nodes.Node,
    /** @noRailsEquivalent PERMANENT */
    readonly innerRelations: DeferredIds[],
  ) {
    super(attribute, inlineSubquery);
  }

  invert(): DeferredIdsIn {
    return new DeferredIdsIn(
      this.left as Arel.Attribute,
      this.right as Nodes.Node,
      this.innerRelations,
    );
  }
}
