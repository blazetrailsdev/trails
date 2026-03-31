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
    const relation = this.ensureSingleColumnSelect(attribute, value);
    return attribute.in(relation.toArel());
  }

  callNegated(attribute: Nodes.Attribute, value: any): Nodes.Node {
    const relation = this.ensureSingleColumnSelect(attribute, value);
    return attribute.notIn(relation.toArel());
  }

  private ensureSingleColumnSelect(attribute: Nodes.Attribute, value: any): any {
    let relation = value;

    if (relation.selectValues.length === 0) {
      const model = relation._modelClass;
      const pk = model?.primaryKey ?? "id";
      if (Array.isArray(pk)) {
        throw new Error(`Cannot map composite primary key ${pk.join(", ")} to ${attribute.name}`);
      }
      relation = relation.select(pk);
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
