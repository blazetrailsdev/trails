import { Nodes } from "@blazetrails/arel";
import { ArgumentError } from "@blazetrails/activemodel";

import { NotImplementedError } from "../../errors.js";

import { rubyInspectArray } from "../ruby-inspect.js";
import { DeferredDistinctPkIn } from "./deferred-distinct-pk-in.js";

export class RelationHandler {
  /** @missingRailsCall empty? — PERMANENT */
  call(attribute: Nodes.Attribute, value: any): Nodes.Node {
    const deferred = this.deferDistinctPkMaterialization(attribute, value);
    if (deferred) return deferred;
    const relation = this.injectPrimaryKeySelect(attribute, this.applyJoinDependency(value));
    return attribute.in(relation.arel());
  }

  private deferDistinctPkMaterialization(
    attribute: Nodes.Attribute,
    value: any,
  ): Nodes.Node | null {
    if (typeof value?._isDeferredDistinctPkSubquery !== "function") return null;
    if (!value._isDeferredDistinctPkSubquery()) return null;
    const inlineSubquery = value._buildDeferredDistinctPkInlineSubquery();
    return new DeferredDistinctPkIn(attribute, inlineSubquery, value);
  }

  private applyJoinDependency(value: any): any {
    if (typeof value?.applyJoinDependency !== "function") return value;
    if (value.isEagerLoading !== true) return value;
    let resolved: any;
    const pending = value.applyJoinDependency({}, (relation: any) => {
      resolved = relation;
    });
    if (resolved === undefined) {
      pending.catch(() => {});
      // @nie disposition=TODO
      throw new NotImplementedError(
        "Using an eager-loaded relation with a limit/offset over a collection " +
          "association as a subquery value is not supported: Rails resolves this by " +
          "executing a query to materialize the limited primary keys " +
          "(distinct_relation_for_primary_key), which the synchronous predicate " +
          "builder cannot do. Materialize the ids first, e.g. " +
          "where(id: await rel.pluck(primaryKey)).",
      );
    }
    return resolved;
  }

  private injectPrimaryKeySelect(attribute: Nodes.Attribute, value: any): any {
    if (value.selectValues.length !== 0) {
      return value;
    }

    const model = value._model;
    const pk = model?.primaryKey ?? "id";
    if (Array.isArray(pk)) {
      throw new ArgumentError(
        `Cannot map composite primary key ${rubyInspectArray(pk)} to ${attribute.name}`,
      );
    }
    return value.select(model.arelTable.get(pk));
  }
}
