import type * as Arel from "@blazetrails/arel";
import { Nodes } from "@blazetrails/arel";
import { ArgumentError } from "@blazetrails/activemodel";

import { DeferredIdsIn } from "./deferred-distinct-pk-in.js";
import { isEmpty, rbInspect } from "@blazetrails/ruby-compat";

export class RelationHandler {
  call(attribute: Arel.Attribute, value: any): Nodes.Node {
    const deferred = this.deferDistinctPkMaterialization(attribute, value);
    if (deferred) return deferred;
    value = this.applyJoinDependency(value);

    if (isEmpty(value.selectValues)) {
      const model = value.model;
      if (model.isCompositePrimaryKey()) {
        throw new ArgumentError(
          `Cannot map composite primary key ${rbInspect(model.primaryKey)} to ${attribute.name}`,
        );
      } else {
        value = value.select(value.table.get(model.primaryKey));
      }
    }

    return attribute.in(value.arel());
  }

  private deferDistinctPkMaterialization(attribute: Arel.Attribute, value: any): Nodes.Node | null {
    if (typeof value?._isDeferredDistinctPkSubquery !== "function") return null;
    if (!value._isDeferredDistinctPkSubquery()) return null;
    const inlineSubquery = value._buildDeferredDistinctPkInlineSubquery();
    return new DeferredIdsIn(attribute, inlineSubquery.ast, [
      { ids: () => value._materializeDistinctPkIds() },
    ]);
  }

  private applyJoinDependency(value: any): any {
    if (typeof value?.applyJoinDependency !== "function") return value;
    if (value.isEagerLoading !== true) return value;
    let resolved: any;
    value.applyJoinDependency({}, (relation: any) => {
      resolved = relation;
    });
    return resolved;
  }
}
