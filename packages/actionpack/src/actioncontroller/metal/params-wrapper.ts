/**
 * ActionController::ParamsWrapper::Options
 *
 * Configuration data container for parameter wrapping. The wrapping
 * logic itself lives in actioncontroller/params-wrapper.ts.
 * @see https://api.rubyonrails.org/classes/ActionController/ParamsWrapper.html
 */

export class Options {
  name: string | null;
  format: string[] | null;
  include: string[] | null;
  exclude: string[] | null;
  klass: unknown;
  model: unknown;

  constructor(
    name: string | null = null,
    format: string[] | null = null,
    include: string[] | null = null,
    exclude: string[] | null = null,
    klass: unknown = null,
    model: unknown = null,
  ) {
    this.name = name;
    this.format = format;
    this.include = include;
    this.exclude = exclude;
    this.klass = klass;
    this.model = model;
  }

  static fromHash(hash: Record<string, unknown>): Options {
    const rawFormat = hash.format;
    const format =
      rawFormat == null
        ? null
        : Array.isArray(rawFormat)
          ? (rawFormat as string[])
          : [rawFormat as string];
    return new Options(
      (hash.name as string | null) ?? null,
      format,
      (hash.include as string[] | null) ?? null,
      (hash.exclude as string[] | null) ?? null,
      hash.klass ?? null,
      hash.model ?? null,
    );
  }
}

export function wrapParameters(
  params: Record<string, unknown>,
  name: string,
  include?: string[] | null,
  exclude?: string[] | null,
): Record<string, unknown> {
  const wrapped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (key === name || key === "controller" || key === "action") continue;
    if (include && !include.includes(key)) continue;
    if (exclude && exclude.includes(key)) continue;
    wrapped[key] = value;
  }
  return { ...params, [name]: wrapped };
}
