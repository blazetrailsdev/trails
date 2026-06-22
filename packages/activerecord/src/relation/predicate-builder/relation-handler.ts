import { Nodes } from "@blazetrails/arel";
import { ArgumentError } from "@blazetrails/activemodel";

import { rubyInspectArray } from "../ruby-inspect.js";
import { DeferredDistinctPkIn, DeferredDistinctPkNotIn } from "./deferred-distinct-pk-in.js";

/**
 * Handles Relation values in where conditions by converting them to
 * IN subqueries.
 *
 * Mirrors: ActiveRecord::PredicateBuilder::RelationHandler
 *
 * Examples:
 *   where({ author_id: Author.where({ active: true }) })
 *     → author_id IN (SELECT authors.id FROM authors WHERE active = true)
 */
export class RelationHandler {
  call(attribute: Nodes.Attribute, value: any): Nodes.Node {
    const deferred = this.deferDistinctPkMaterialization(attribute, value, false);
    if (deferred) return deferred;
    const relation = this.injectPrimaryKeySelect(attribute, this.applyJoinDependency(value));
    return attribute.in(relation.toArel());
  }

  callNegated(attribute: Nodes.Attribute, value: any): Nodes.Node {
    const deferred = this.deferDistinctPkMaterialization(attribute, value, true);
    if (deferred) return deferred;
    const relation = this.injectPrimaryKeySelect(attribute, this.applyJoinDependency(value));
    return attribute.notIn(relation.toArel());
  }

  // Rails routes an eager-loading subquery with a limit/offset over a collection
  // reflection through `distinct_relation_for_primary_key`, which executes a
  // query to materialize the limited DISTINCT primary keys (finder_methods.rb:463,
  // schema_statements.rb:1429). trails' `.where()` is synchronous, so we cannot
  // run that query here. Instead emit a deferred marker carrying the inner
  // relation; the relation load pipeline materializes the ids and substitutes a
  // literal `attribute.in([...ids])` before compile. Returns null when `value`
  // is not this special case (the normal `IN (subquery)` path applies).
  private deferDistinctPkMaterialization(
    attribute: Nodes.Attribute,
    value: any,
    negated: boolean,
  ): Nodes.Node | null {
    if (typeof value?._isDeferredDistinctPkSubquery !== "function") return null;
    if (!value._isDeferredDistinctPkSubquery()) return null;
    const inlineSubquery = value._buildDeferredDistinctPkInlineSubquery();
    return negated
      ? new DeferredDistinctPkNotIn(attribute, inlineSubquery, value)
      : new DeferredDistinctPkIn(attribute, inlineSubquery, value);
  }

  // Mirrors Rails `if value.eager_loading? value = value.send(:apply_join_dependency) end`
  // (predicate_builder/relation_handler.rb:7): normalize an eager-loading
  // subquery so its eager_load/includes become regular (OUTER) joins before the
  // PK select + `value.arel`, rather than being dropped.
  //
  // Pass `group_values.empty?` for apply_join_dependency's
  // `eager_loading: group_values.empty?` default (finder_methods.rb:457): a
  // grouped subquery is eager_loading: false, which skips the
  // distinct_relation_for_primary_key materialization branch
  // (finder_methods.rb:463). Matches relation.ts's own call site (~L3542).
  private applyJoinDependency(value: any): any {
    return typeof value?.applyJoinDependencyForArel === "function"
      ? value.applyJoinDependencyForArel(value._groupColumns?.length === 0)
      : value;
  }

  // Mirrors Rails: inject the table-qualified primary key select only when the
  // subquery has no explicit projection; otherwise pass the relation through
  // unchanged and let the database raise on a column-count mismatch. Rails has
  // no single-column validation here.
  private injectPrimaryKeySelect(attribute: Nodes.Attribute, value: any): any {
    if (value.selectValues.length !== 0) {
      return value;
    }

    const model = value._modelClass;
    const pk = model?.primaryKey ?? "id";
    if (Array.isArray(pk)) {
      // Rails interpolates `model.primary_key` directly, so the composite array
      // renders via Ruby's `Array#to_s` (e.g. `["shop_id", "id"]`).
      throw new ArgumentError(
        `Cannot map composite primary key ${rubyInspectArray(pk)} to ${attribute.name}`,
      );
    }
    // Select the table-qualified primary key, mirroring Rails
    // `value.select(value.arel_table[value.primary_key])`. Now that the
    // subquery's arel carries joins (build_arel convergence), a bare `id`
    // projection is ambiguous when the relation joins another table.
    return value.select(model.arelTable.get(pk));
  }
}
