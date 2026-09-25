import { Autoload, extend, type Extended } from "@blazetrails/activesupport";
import type { Attribute as AttributeClass } from "./attributes/attribute.js";
import type * as NodesModule from "./nodes/index.js";
import type { SelectManager } from "./select-manager.js";
import type { Table } from "./table.js";
import type * as VisitorsModule from "./visitors/index.js";

type AutoloadModule = Autoload.Autoload & Extended<typeof Autoload>;

const loadPath: Record<string, () => Promise<unknown>> = {
  "arel/table": () => import("./table.js"),
  "arel/select_manager": () => import("./select-manager.js"),
  "arel/attributes/attribute": () => import("./attributes/attribute.js"),
  "arel/nodes/unary": () => import("./nodes/unary.js"),
  "arel/nodes/grouping": () => import("./nodes/grouping.js"),
  "arel/nodes/nary": () => import("./nodes/nary.js"),
  "arel/nodes/equality": () => import("./nodes/equality.js"),
  "arel/nodes/in": () => import("./nodes/in.js"),
  "arel/nodes/cte": () => import("./nodes/cte.js"),
  "arel/visitors/dot": () => import("./visitors/dot.js"),
};

export const Arel = { name: "Arel", loadPath } as AutoloadModule & {
  Table: typeof Table;
  SelectManager: typeof SelectManager;
  Attribute: typeof AttributeClass;
};
extend(Arel, Autoload);
Arel.autoload("Table", "arel/table");
Arel.autoload("SelectManager", "arel/select_manager");
Arel.autoload("Attribute", "arel/attributes/attribute");

export const Attributes = { name: "Arel::Attributes", loadPath } as AutoloadModule & {
  Attribute: typeof AttributeClass;
};
extend(Attributes, Autoload);
Attributes.autoload("Attribute", "arel/attributes/attribute");

export const Nodes = { name: "Arel::Nodes", loadPath } as AutoloadModule & typeof NodesModule;
// eslint-disable-next-line @typescript-eslint/no-namespace
export declare namespace Nodes {
  export type Node = NodesModule.Node;
  export type And = NodesModule.And;
  export type Or = NodesModule.Or;
  export type Grouping = NodesModule.Grouping;
  export type SqlLiteral = NodesModule.SqlLiteral;
  export type Fragments = NodesModule.Fragments;
  export type Quoted = NodesModule.Quoted;
  export type Casted = NodesModule.Casted;
  export type Distinct = NodesModule.Distinct;
  export type Function = NodesModule.Function;
  export type Exists = NodesModule.Exists;
  export type Sum = NodesModule.Sum;
  export type Max = NodesModule.Max;
  export type Min = NodesModule.Min;
  export type Avg = NodesModule.Avg;
  export type Count = NodesModule.Count;
  export type NodeExpression = NodesModule.NodeExpression;
  export type Nary = NodesModule.Nary;
  export type HomogeneousIn = NodesModule.HomogeneousIn;
  export type UnqualifiedColumn = NodesModule.UnqualifiedColumn;
  export type LeadingJoin = NodesModule.LeadingJoin;
  export type Unary = NodesModule.Unary;
  export type Offset = NodesModule.Offset;
  export type Limit = NodesModule.Limit;
  export type Lock = NodesModule.Lock;
  export type DistinctOn = NodesModule.DistinctOn;
  export type Bin = NodesModule.Bin;
  export type On = NodesModule.On;
  export type Not = NodesModule.Not;
  export type Lateral = NodesModule.Lateral;
  export type GroupingElement = NodesModule.GroupingElement;
  export type Cube = NodesModule.Cube;
  export type GroupingSet = NodesModule.GroupingSet;
  export type Group = NodesModule.Group;
  export type OptimizerHints = NodesModule.OptimizerHints;
  export type RollUp = NodesModule.RollUp;
  export type Ascending = NodesModule.Ascending;
  export type Descending = NodesModule.Descending;
  export type Ordering = NodesModule.Ordering;
  export type NullsFirst = NodesModule.NullsFirst;
  export type NullsLast = NodesModule.NullsLast;
  export type Binary = NodesModule.Binary;
  export type Assignment = NodesModule.Assignment;
  export type As = NodesModule.As;
  export type Between = NodesModule.Between;
  export type NotEqual = NodesModule.NotEqual;
  export type GreaterThan = NodesModule.GreaterThan;
  export type GreaterThanOrEqual = NodesModule.GreaterThanOrEqual;
  export type LessThan = NodesModule.LessThan;
  export type LessThanOrEqual = NodesModule.LessThanOrEqual;
  export type IsDistinctFrom = NodesModule.IsDistinctFrom;
  export type IsNotDistinctFrom = NodesModule.IsNotDistinctFrom;
  export type NotIn = NodesModule.NotIn;
  export type Join = NodesModule.Join;
  export type Union = NodesModule.Union;
  export type UnionAll = NodesModule.UnionAll;
  export type Intersect = NodesModule.Intersect;
  export type Except = NodesModule.Except;
  export type NodeOrValue = NodesModule.NodeOrValue;
  export type Equality = NodesModule.Equality;
  export type In = NodesModule.In;
  export type Matches = NodesModule.Matches;
  export type DoesNotMatch = NodesModule.DoesNotMatch;
  export type JoinSource = NodesModule.JoinSource;
  export type InnerJoin = NodesModule.InnerJoin;
  export type OuterJoin = NodesModule.OuterJoin;
  export type RightOuterJoin = NodesModule.RightOuterJoin;
  export type FullOuterJoin = NodesModule.FullOuterJoin;
  export type StringJoin = NodesModule.StringJoin;
  export type SelectCore = NodesModule.SelectCore;
  export type SelectStatement = NodesModule.SelectStatement;
  export type InsertStatement = NodesModule.InsertStatement;
  export type UpdateStatement = NodesModule.UpdateStatement;
  export type DeleteStatement = NodesModule.DeleteStatement;
  export type ValuesList = NodesModule.ValuesList;
  export type NamedFunction = NodesModule.NamedFunction;
  export type Window = NodesModule.Window;
  export type NamedWindow = NodesModule.NamedWindow;
  export type Preceding = NodesModule.Preceding;
  export type Following = NodesModule.Following;
  export type CurrentRow = NodesModule.CurrentRow;
  export type Rows = NodesModule.Rows;
  export type Range = NodesModule.Range;
  export type Over = NodesModule.Over;
  export type With = NodesModule.With;
  export type WithRecursive = NodesModule.WithRecursive;
  export type TableAlias = NodesModule.TableAlias;
  export type Case = NodesModule.Case;
  export type When = NodesModule.When;
  export type Else = NodesModule.Else;
  export type Extract = NodesModule.Extract;
  export type InfixOperation = NodesModule.InfixOperation;
  export type BitwiseAnd = NodesModule.BitwiseAnd;
  export type BitwiseOr = NodesModule.BitwiseOr;
  export type BitwiseXor = NodesModule.BitwiseXor;
  export type BitwiseShiftLeft = NodesModule.BitwiseShiftLeft;
  export type BitwiseShiftRight = NodesModule.BitwiseShiftRight;
  export type Addition = NodesModule.Addition;
  export type Subtraction = NodesModule.Subtraction;
  export type Multiplication = NodesModule.Multiplication;
  export type Division = NodesModule.Division;
  export type Concat = NodesModule.Concat;
  export type Contains = NodesModule.Contains;
  export type Overlaps = NodesModule.Overlaps;
  export type BindParam = NodesModule.BindParam;
  export type BoundSqlLiteral = NodesModule.BoundSqlLiteral;
  export type True = NodesModule.True;
  export type False = NodesModule.False;
  export type Regexp = NodesModule.Regexp;
  export type NotRegexp = NodesModule.NotRegexp;
  export type Comment = NodesModule.Comment;
  export type Cte = NodesModule.Cte;
  export type UnaryOperation = NodesModule.UnaryOperation;
  export type BitwiseNot = NodesModule.BitwiseNot;
  export type Filter = NodesModule.Filter;
}
extend(Nodes, Autoload);
Nodes.autoload("Not", "arel/nodes/unary");
Nodes.autoload("Grouping", "arel/nodes/grouping");
Nodes.autoload("And", "arel/nodes/nary");
Nodes.autoload("Or", "arel/nodes/nary");
Nodes.autoload("Equality", "arel/nodes/equality");
Nodes.autoload("In", "arel/nodes/in");
Nodes.autoload("Cte", "arel/nodes/cte");

export const Visitors = { name: "Arel::Visitors", loadPath } as AutoloadModule &
  Pick<
    typeof VisitorsModule,
    "ToSql" | "UnsupportedVisitError" | "MySQL" | "PostgreSQL" | "SQLite" | "Dot" | "Visitor"
  >;
// eslint-disable-next-line @typescript-eslint/no-namespace
export declare namespace Visitors {
  export type ToSql = VisitorsModule.ToSql;
  export type UnsupportedVisitError = VisitorsModule.UnsupportedVisitError;
  export type MySQL = VisitorsModule.MySQL;
  export type PostgreSQL = VisitorsModule.PostgreSQL;
  export type SQLite = VisitorsModule.SQLite;
  export type Dot = VisitorsModule.Dot;
  export type Visitor = VisitorsModule.Visitor;
  export type ArelConnection = VisitorsModule.ArelConnection;
}
extend(Visitors, Autoload);
Visitors.autoload("Dot", "arel/visitors/dot");
