import type { ForeignKeyDefinition } from "./connection-adapters/abstract/schema-definitions.js";
import { classify, pluralize, singularize, tableize, underscore } from "@blazetrails/activesupport";
import { Temporal } from "@blazetrails/date";
import { metadataTableNames } from "./tasks/database-tasks.js";

export interface IntrospectedTable {
  name: string;
  primaryKey: string | string[] | null;
  foreignKeys: ForeignKeyDefinition[];
  columns: { name: string; type: string }[];
}

export interface GenerateModelsOptions {
  sourceHint?: string;
  stripPrefix?: string;
  stripSuffix?: string;
  noHeader?: boolean;
  now?: Temporal.Instant;
}

interface PendingAssoc {
  kind: "belongsTo" | "hasMany";
  name: string;
  opts: Record<string, string>;
}

interface PlannedClass {
  name: string;
  tableName: string;
  primaryKey: string | string[] | null;
  associations: PendingAssoc[];
  leadingComments: string[];
}

export function unqualify(tableName: string): string {
  const parts: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < tableName.length; i++) {
    const ch = tableName[i];
    if (ch === '"') {
      current += ch;
      if (inQuotes && tableName[i + 1] === '"') {
        current += tableName[i + 1];
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "." && !inQuotes) {
      parts.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return unquoteIdentifier(parts[parts.length - 1]);
}

function unquoteIdentifier(id: string): string {
  if (id.length >= 2 && id[0] === '"' && id[id.length - 1] === '"') {
    return id.slice(1, -1).replaceAll('""', '"');
  }
  return id;
}

export function generateModels(
  tables: IntrospectedTable[],
  opts: GenerateModelsOptions = {},
): string {
  const { stripPrefix, stripSuffix, noHeader, sourceHint } = opts;
  const now = opts.now ?? Temporal.Now.instant();

  const builtinIgnore = metadataTableNames();
  const hasNoPk = (pk: string | string[] | null): boolean =>
    pk === null || (Array.isArray(pk) && pk.length === 0);
  const skipped: Array<{ name: string; reason: string }> = [];
  const kept: IntrospectedTable[] = [];
  for (const t of tables) {
    if (builtinIgnore.has(t.name)) continue;
    if (hasNoPk(t.primaryKey)) {
      skipped.push({ name: t.name, reason: "no primary key (likely a view)" });
      continue;
    }
    kept.push(t);
  }

  kept.sort((a, b) => a.name.localeCompare(b.name));

  const strip = (name: string): string => {
    let n = name;
    if (stripPrefix && n.startsWith(stripPrefix)) n = n.slice(stripPrefix.length);
    if (stripSuffix && n.endsWith(stripSuffix)) n = n.slice(0, -stripSuffix.length);
    return n;
  };

  const classNameForTable = (tableName: string): string => classify(strip(tableName));
  const classes = new Map<string, PlannedClass>();
  const nameToTable = new Map<string, string>();
  for (const t of kept) {
    const className = classNameForTable(t.name);
    const existing = nameToTable.get(className);
    if (existing !== undefined) {
      const [a, b] = [existing, t.name].sort();
      throw new Error(
        `class name collision: tables "${a}" and "${b}" both classify to \`${className}\`.`,
      );
    }
    nameToTable.set(className, t.name);
    classes.set(t.name, {
      name: className,
      tableName: t.name,
      primaryKey: t.primaryKey,
      associations: [],
      leadingComments: [],
    });
  }

  interface PendingHasMany {
    toTable: string;
    name: string;
    opts: Record<string, string>;
  }
  const hasManyByTable = new Map<string, PendingHasMany[]>();

  for (const t of kept) {
    const fromCls = classes.get(t.name);
    if (!fromCls) continue;
    const colKey = (c: string | string[]): string => (Array.isArray(c) ? c.join(",") : c);
    const fks = [...t.foreignKeys].sort((a, b) => colKey(a.column).localeCompare(colKey(b.column)));
    for (const fk of fks) {
      const toTableUnqual = unqualify(fk.toTable);
      if (Array.isArray(fk.column) || fk.column.includes(",")) {
        const colStr = Array.isArray(fk.column) ? fk.column.join(",") : fk.column;
        const pkStr = Array.isArray(fk.primaryKey) ? fk.primaryKey.join(",") : fk.primaryKey;
        fromCls.leadingComments.push(
          `// TODO composite FK ${fk.name}: ${colStr} -> ${fk.toTable}.${pkStr}`,
        );
        continue;
      }
      const toCls = classes.get(toTableUnqual);
      if (!toCls) continue;

      const belongsToBase =
        fk.column.endsWith("_id") && fk.column !== "_id"
          ? fk.column.slice(0, -3)
          : underscore(singularize(toTableUnqual));

      let belongsToName = belongsToBase;
      if (fromCls.associations.some((a) => a.kind === "belongsTo" && a.name === belongsToName)) {
        belongsToName = underscore(fk.column);
        let suffix = 2;
        while (
          fromCls.associations.some((a) => a.kind === "belongsTo" && a.name === belongsToName)
        ) {
          belongsToName = `${underscore(fk.column)}_${suffix}`;
          suffix += 1;
        }
      }

      const expectedForeignKey = `${underscore(belongsToName)}_id`;
      const conventionalClassName = classify(belongsToName);
      const belongsToOpts: Record<string, string> = {};
      if (fk.column !== expectedForeignKey) belongsToOpts.foreignKey = fk.column;
      if (toCls.name !== conventionalClassName) belongsToOpts.className = toCls.name;

      fromCls.associations.push({ kind: "belongsTo", name: belongsToName, opts: belongsToOpts });

      const hasManyBaseName = pluralize(underscore(fromCls.name));

      const existingHms = hasManyByTable.get(toTableUnqual) ?? [];
      let hasManyName = hasManyBaseName;
      if (existingHms.some((h) => h.name === hasManyName)) {
        const rolePrefix = `${underscore(belongsToName)}_`;
        hasManyName = `${rolePrefix}${hasManyBaseName}`;
        let suffix = 2;
        while (existingHms.some((h) => h.name === hasManyName)) {
          hasManyName = `${rolePrefix}${hasManyBaseName}_${suffix}`;
          suffix += 1;
        }
      }

      const hmConventionalClassName = classify(singularize(hasManyName));
      const hmConventionalForeignKey = `${underscore(toCls.name)}_id`;
      const hmOpts: Record<string, string> = {};
      if (fk.column !== hmConventionalForeignKey) hmOpts.foreignKey = fk.column;
      if (fromCls.name !== hmConventionalClassName) hmOpts.className = fromCls.name;

      existingHms.push({ toTable: toTableUnqual, name: hasManyName, opts: hmOpts });
      hasManyByTable.set(toTableUnqual, existingHms);
    }
  }

  for (const [tableName, hms] of hasManyByTable) {
    const cls = classes.get(tableName);
    if (!cls) continue;
    for (const hm of hms) {
      cls.associations.push({ kind: "hasMany", name: hm.name, opts: hm.opts });
    }
  }

  const out: string[] = [];

  if (!noHeader) {
    const fromClause = sourceHint ? ` from ${sourceHint}` : "";
    out.push(
      `// GENERATED by trails-models-dump${fromClause} on ${now.toString({ smallestUnit: "millisecond", roundingMode: "trunc" })}.`,
      "// Do not edit by hand — re-run trails-models-dump to regenerate.",
    );
    const total = kept.length;
    const fkCount = kept.reduce((n, t) => n + t.foreignKeys.length, 0);
    const assocCount =
      2 *
      kept.reduce(
        (n, t) =>
          n +
          t.foreignKeys.filter(
            (fk) =>
              !Array.isArray(fk.column) &&
              !fk.column.includes(",") &&
              classes.has(unqualify(fk.toTable)),
          ).length,
        0,
      );
    out.push(`//`);
    out.push(
      `// ${total} model${total === 1 ? "" : "s"}, ${assocCount} association${assocCount === 1 ? "" : "s"} from ${fkCount} foreign key${fkCount === 1 ? "" : "s"}.`,
    );
    for (const s of skipped) {
      out.push(`// SKIPPED ${s.name}: ${s.reason}`);
    }
    out.push("");
  }

  out.push(`import { Base } from "@blazetrails/activerecord";`, "");

  const emittedClasses = [...classes.values()].sort((a, b) => a.name.localeCompare(b.name));
  for (let i = 0; i < emittedClasses.length; i++) {
    const cls = emittedClasses[i];
    out.push(`export class ${cls.name} extends Base {`);
    const staticLines: string[] = [];

    if (tableize(cls.name) !== cls.tableName) {
      staticLines.push(`    this._tableName = ${JSON.stringify(cls.tableName)};`);
    }
    if (Array.isArray(cls.primaryKey) && cls.primaryKey.length > 1) {
      staticLines.push(`    this._primaryKey = ${JSON.stringify(cls.primaryKey)};`);
    } else if (typeof cls.primaryKey === "string" && cls.primaryKey !== "id") {
      staticLines.push(`    this._primaryKey = ${JSON.stringify(cls.primaryKey)};`);
    } else if (
      Array.isArray(cls.primaryKey) &&
      cls.primaryKey.length === 1 &&
      cls.primaryKey[0] !== "id"
    ) {
      staticLines.push(`    this._primaryKey = ${JSON.stringify(cls.primaryKey[0])};`);
    }

    for (const c of cls.leadingComments) {
      staticLines.push(`    ${c}`);
    }
    const belongsTo = cls.associations
      .filter((a) => a.kind === "belongsTo")
      .sort((a, b) => a.name.localeCompare(b.name));
    const hasMany = cls.associations
      .filter((a) => a.kind === "hasMany")
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const a of [...belongsTo, ...hasMany]) {
      staticLines.push(`    ${formatAssoc(a.kind, a.name, a.opts)}`);
    }

    if (staticLines.length === 0) {
      out.push(`  static {}`);
    } else {
      out.push("  static {");
      out.push(...staticLines);
      out.push("  }");
    }
    out.push(`}`);
    if (i < emittedClasses.length - 1) out.push("");
  }

  return out.join("\n") + "\n";
}

function formatAssoc(
  kind: "belongsTo" | "hasMany",
  name: string,
  opts: Record<string, string>,
): string {
  const optKeys = Object.keys(opts).sort();
  if (optKeys.length === 0) return `this.${kind}(${JSON.stringify(name)});`;
  const optStr = optKeys.map((k) => `${k}: ${JSON.stringify(opts[k])}`).join(", ");
  return `this.${kind}(${JSON.stringify(name)}, { ${optStr} });`;
}
