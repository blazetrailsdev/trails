function getAggregation(modelClass: any, name: string): { klass: any } | null {
  const aggs: Record<string, { klass: any }> | undefined = modelClass.aggregateReflections;
  return aggs?.[name] ?? null;
}

const MAX_MULTIPARAMETER_INDEX = 100;

const MULTIPARAMETER_ATTRIBUTE_PATTERN = /^([^(]+)\((\d+)([if]?)\)$/;

export function extractMultiparameterCallstack(attrs: Record<string, unknown>): {
  multiparams: Record<string, Record<number, unknown>>;
  regular: Record<string, unknown>;
} {
  const multiparams: Record<string, Record<number, unknown>> = Object.create(null);
  const regular: Record<string, unknown> = Object.create(null);

  for (const [key, value] of Object.entries(attrs)) {
    const match = key.match(MULTIPARAMETER_ATTRIBUTE_PATTERN);
    if (match) {
      const name = match[1];
      const pos = parseInt(match[2], 10);
      if (pos > MAX_MULTIPARAMETER_INDEX) continue;
      const typeFlag = match[3];
      let castValue: unknown;
      if (typeFlag === "i") {
        if (isBlank(value)) {
          castValue = null;
        } else {
          const n = parseInt(String(value), 10);
          castValue = isNaN(n) ? null : n;
        }
      } else if (typeFlag === "f") {
        if (isBlank(value)) {
          castValue = null;
        } else {
          const n = parseFloat(String(value));
          castValue = isNaN(n) ? null : n;
        }
      } else {
        castValue = isBlank(value) ? null : value;
      }
      if (!(name in multiparams)) multiparams[name] = {};
      multiparams[name][pos] = castValue;
    } else {
      regular[key] = value;
    }
  }

  return { multiparams, regular };
}

export function assignMultiparameterValues(
  instance: { constructor: any; writeAttribute(name: string, value: unknown): void },
  name: string,
  values: Record<number, unknown> | null,
): void {
  const aggregation = getAggregation(instance.constructor, name);
  if (aggregation) {
    if (values !== null) assignAggregation(instance as any, name, values, aggregation);
  } else {
    instance.writeAttribute(name, values);
  }
}

function assignAggregation(
  instance: Record<string, unknown> & { writeAttribute(name: string, value: unknown): void },
  name: string,
  partsMap: Record<number, unknown>,
  aggregation: { klass: any },
): void {
  const maxPos = Math.min(Math.max(...Object.keys(partsMap).map(Number)), MAX_MULTIPARAMETER_INDEX);
  const values = Array.from({ length: maxPos }, (_, i) => partsMap[i + 1] ?? null);

  if (values.every(isBlank)) return;

  const AggClass = aggregation.klass as new (...args: unknown[]) => unknown;
  instance[name] = new AggClass(...values);
}

function isBlank(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  if (typeof v === "number") return isNaN(v);
  return false;
}
