import { Nodes } from "@blazetrails/arel";

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
    const relation = this.injectPrimaryKeySelect(attribute, this.applyJoinDependency(value));
    return attribute.in(relation.toArel());
  }

  callNegated(attribute: Nodes.Attribute, value: any): Nodes.Node {
    const relation = this.injectPrimaryKeySelect(attribute, this.applyJoinDependency(value));
    return attribute.notIn(relation.toArel());
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
      throw new Error(`Cannot map composite primary key ${pk.join(", ")} to ${attribute.name}`);
    }
    // Select the table-qualified primary key, mirroring Rails
    // `value.select(value.arel_table[value.primary_key])`. Now that the
    // subquery's arel carries joins (build_arel convergence), a bare `id`
    // projection is ambiguous when the relation joins another table.
    return value.select(model.arelTable.get(pk));
  }
}
