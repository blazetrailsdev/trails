import { Autoload, extend, type Extended } from "@blazetrails/activesupport";
import type { Attribute as AttributeClass } from "./attributes/attribute.js";
import type { buildQuoted } from "./nodes/casted.js";
import type { Cte } from "./nodes/cte.js";
import type { Equality } from "./nodes/equality.js";
import type { Grouping } from "./nodes/grouping.js";
import type { In } from "./nodes/in.js";
import type { And, Or } from "./nodes/nary.js";
import type { Not } from "./nodes/unary.js";
import type { SelectManager } from "./select-manager.js";
import type { Table } from "./table.js";
import type { Dot } from "./visitors/dot.js";

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

export const Nodes = { name: "Arel::Nodes", loadPath } as AutoloadModule & {
  Not: typeof Not;
  Grouping: typeof Grouping;
  And: typeof And;
  Or: typeof Or;
  Equality: typeof Equality;
  In: typeof In;
  Cte: typeof Cte;
  buildQuoted: typeof buildQuoted;
};
extend(Nodes, Autoload);
Nodes.autoload("Not", "arel/nodes/unary");
Nodes.autoload("Grouping", "arel/nodes/grouping");
Nodes.autoload("And", "arel/nodes/nary");
Nodes.autoload("Or", "arel/nodes/nary");
Nodes.autoload("Equality", "arel/nodes/equality");
Nodes.autoload("In", "arel/nodes/in");
Nodes.autoload("Cte", "arel/nodes/cte");

export const Visitors = { name: "Arel::Visitors", loadPath } as AutoloadModule & {
  Dot: typeof Dot;
};
extend(Visitors, Autoload);
Visitors.autoload("Dot", "arel/visitors/dot");
