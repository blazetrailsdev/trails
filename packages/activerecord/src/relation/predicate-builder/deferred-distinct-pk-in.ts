import { Nodes } from "@blazetrails/arel";

type DeferredIds = { ids(): Promise<unknown[]> };

/** @noRailsEquivalent PERMANENT */
export class DeferredIdsIn extends Nodes.In {
  constructor(
    attribute: Nodes.Attribute,
    inlineSubquery: Nodes.Node,
    /** @noRailsEquivalent PERMANENT */
    readonly innerRelations: DeferredIds[],
  ) {
    super(attribute, inlineSubquery);
  }

  invert(): DeferredIdsNotIn {
    return new DeferredIdsNotIn(
      this.left as Nodes.Attribute,
      this.right as Nodes.Node,
      this.innerRelations,
    );
  }
}

/** @noRailsEquivalent PERMANENT */
export class DeferredIdsNotIn extends Nodes.NotIn {
  constructor(
    attribute: Nodes.Attribute,
    inlineSubquery: Nodes.Node,
    /** @noRailsEquivalent PERMANENT */
    readonly innerRelations: DeferredIds[],
  ) {
    super(attribute, inlineSubquery);
  }

  invert(): DeferredIdsIn {
    return new DeferredIdsIn(
      this.left as Nodes.Attribute,
      this.right as Nodes.Node,
      this.innerRelations,
    );
  }
}
