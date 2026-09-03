/** @noRailsEquivalent CONVERGEABLE converge-relation-deferred-and-thenable-machinery MOVED-BY-SHORT-NAME: constructor invert. */
import { Nodes } from "@blazetrails/arel";

export class DeferredDistinctPkIn extends Nodes.In {
  constructor(
    attribute: Nodes.Attribute,
    inlineSubquery: Nodes.Node,
    readonly innerRelation: { _materializeDistinctPkIds(): Promise<unknown[]> },
  ) {
    super(attribute, inlineSubquery);
  }

  invert(): DeferredDistinctPkNotIn {
    return new DeferredDistinctPkNotIn(
      this.left as Nodes.Attribute,
      this.right as Nodes.Node,
      this.innerRelation,
    );
  }
}

export class DeferredDistinctPkNotIn extends Nodes.NotIn {
  constructor(
    attribute: Nodes.Attribute,
    inlineSubquery: Nodes.Node,
    readonly innerRelation: { _materializeDistinctPkIds(): Promise<unknown[]> },
  ) {
    super(attribute, inlineSubquery);
  }

  invert(): DeferredDistinctPkIn {
    return new DeferredDistinctPkIn(
      this.left as Nodes.Attribute,
      this.right as Nodes.Node,
      this.innerRelation,
    );
  }
}

export class DeferredIdsNotIn extends Nodes.NotIn {
  constructor(
    attribute: Nodes.Attribute,
    inlineSubquery: Nodes.Node,
    readonly literalIds: unknown[],
    readonly innerRelations: { ids(): Promise<unknown[]> }[],
  ) {
    super(attribute, inlineSubquery);
  }

  invert(): DeferredIdsIn {
    return new DeferredIdsIn(
      this.left as Nodes.Attribute,
      this.right as Nodes.Node,
      this.literalIds,
      this.innerRelations,
    );
  }
}

export class DeferredIdsIn extends Nodes.In {
  constructor(
    attribute: Nodes.Attribute,
    inlineSubquery: Nodes.Node,
    readonly literalIds: unknown[],
    readonly innerRelations: { ids(): Promise<unknown[]> }[],
  ) {
    super(attribute, inlineSubquery);
  }

  invert(): DeferredIdsNotIn {
    return new DeferredIdsNotIn(
      this.left as Nodes.Attribute,
      this.right as Nodes.Node,
      this.literalIds,
      this.innerRelations,
    );
  }
}
