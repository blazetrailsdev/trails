import type { Node } from "./nodes/node.js";
import type { SqlLiteral } from "./nodes/sql-literal.js";
import type { BoundSqlLiteral } from "./nodes/bound-sql-literal.js";
import { InsertManager } from "./insert-manager.js";
import { UpdateManager } from "./update-manager.js";
import { DeleteManager } from "./delete-manager.js";
import type { JoinSource } from "./nodes/join-source.js";

export type UpdateValues = [Node, unknown][] | string | SqlLiteral | BoundSqlLiteral;

/** @noRailsEquivalent PERMANENT */
export interface CrudHost {
  readonly source: JoinSource;
  readonly limit: unknown;
  readonly offset: unknown;
  readonly orders: Node[];
  readonly constraints: Node[];
}

export interface Crud {
  compileInsert(values: [Node, unknown][]): InsertManager;
  createInsert(): InsertManager;
  compileUpdate(
    values: UpdateValues,
    key?: Node | Node[] | null,
    havingClause?: Node | null,
    groupValuesColumns?: Node[],
  ): UpdateManager;
  compileDelete(
    key?: Node | Node[] | null,
    havingClause?: Node | null,
    groupValuesColumns?: Node[],
  ): DeleteManager;
}

export const Crud: Crud = {
  compileInsert(this: CrudHost & Crud, values: [Node, unknown][]): InsertManager {
    const im = this.createInsert();
    im.insert(values);
    return im;
  },

  createInsert(): InsertManager {
    return new InsertManager();
  },

  compileUpdate(
    this: CrudHost,
    values: UpdateValues,
    key: Node | Node[] | null = null,
    havingClause: Node | null = null,
    groupValuesColumns: Node[] = [],
  ): UpdateManager {
    const um = new UpdateManager(this.source);
    um.set(values);
    um.take(this.limit);
    um.offset(this.offset);
    um.order(...this.orders);
    um.wheres = this.constraints;
    um.key = key;

    if (groupValuesColumns.length > 0) um.group(groupValuesColumns);
    if (havingClause !== null) um.having(havingClause);
    return um;
  },

  compileDelete(
    this: CrudHost,
    key: Node | Node[] | null = null,
    havingClause: Node | null = null,
    groupValuesColumns: Node[] = [],
  ): DeleteManager {
    const dm = new DeleteManager(this.source);
    dm.take(this.limit);
    dm.offset(this.offset);
    dm.order(...this.orders);
    dm.wheres = this.constraints;
    dm.key = key;
    if (groupValuesColumns.length > 0) dm.group(groupValuesColumns);
    if (havingClause !== null) dm.having(havingClause);
    return dm;
  },
};
