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
    const relation = this.ensureSingleColumnSelect(attribute, this.applyJoinDependency(value));
    return attribute.in(relation.toArel());
  }

  callNegated(attribute: Nodes.Attribute, value: any): Nodes.Node {
    const relation = this.ensureSingleColumnSelect(attribute, this.applyJoinDependency(value));
    return attribute.notIn(relation.toArel());
  }

  // Mirrors Rails `if value.eager_loading? value = value.send(:apply_join_dependency) end`
  // (predicate_builder/relation_handler.rb:7): normalize an eager-loading
  // subquery so its eager_load/includes become regular (OUTER) joins before the
  // PK select + `value.arel`, rather than being dropped.
  private applyJoinDependency(value: any): any {
    return typeof value?.applyJoinDependencyForArel === "function"
      ? value.applyJoinDependencyForArel()
      : value;
  }

  private ensureSingleColumnSelect(attribute: Nodes.Attribute, value: any): any {
    let relation = value;

    if (relation.selectValues.length === 0) {
      const model = relation._modelClass;
      const pk = model?.primaryKey ?? "id";
      if (Array.isArray(pk)) {
        throw new Error(`Cannot map composite primary key ${pk.join(", ")} to ${attribute.name}`);
      }
      // Select the table-qualified primary key, mirroring Rails
      // `value.select(value.arel_table[value.primary_key])`. Now that the
      // subquery's arel carries joins (build_arel convergence), a bare `id`
      // projection is ambiguous when the relation joins another table.
      relation = relation.select(model.arelTable.get(pk));
    } else if (relation.selectValues.length === 1) {
      const selectValue = relation.selectValues[0];
      if (typeof selectValue === "string") {
        const trimmed = selectValue.trim();
        if (trimmed === "*" || /\.\*$/.test(trimmed) || trimmed.includes(",")) {
          throw new Error(
            `Expected subquery for ${attribute.name} to select a single column, but got ambiguous projection: ${trimmed}`,
          );
        }
      }
    } else {
      throw new Error(
        `Expected subquery for ${attribute.name} to select a single column, but it selects ${relation.selectValues.length} columns.`,
      );
    }

    return relation;
  }
}
