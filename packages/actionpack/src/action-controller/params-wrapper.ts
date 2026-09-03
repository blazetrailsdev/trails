import { Parameters } from "./metal/strong-parameters.js";
import { EXCLUDE_PARAMETERS as RAILS_EXCLUDE_PARAMETERS } from "./metal/params-wrapper.js";

export interface WrapParametersOptions {
  include?: string[];
  exclude?: string[];
  format?: string | string[];
  name?: string;
}

const EXCLUDE_PARAMETERS = new Set([
  ...RAILS_EXCLUDE_PARAMETERS,
  "controller",
  "action",
  "format",
  "commit",
]);

export function wrapParameters(
  key: string,
  options: Omit<WrapParametersOptions, "name"> = {},
): ParamsWrapperConfig {
  return {
    key,
    include: options.include ? new Set(options.include) : null,
    exclude: new Set([...EXCLUDE_PARAMETERS, ...(options.exclude ?? [])]),
    format: normalizeFormats(options.format),
  };
}

export interface ParamsWrapperConfig {
  key: string;
  include: Set<string> | null;
  exclude: Set<string>;
  format: Set<string>;
}

function normalizeFormats(format?: string | string[]): Set<string> {
  if (!format) return new Set(["json"]);
  if (typeof format === "string") return new Set([format]);
  return new Set(format);
}

export function applyParamsWrapper(
  params: Parameters,
  config: ParamsWrapperConfig,
  requestFormat = "json",
): Parameters {
  if (!config.format.has(requestFormat)) {
    return params;
  }

  if (params.has(config.key)) {
    return params;
  }

  const wrapped: Record<string, unknown> = {};
  const original = params.toUnsafeHash();

  for (const [k, v] of Object.entries(original)) {
    if (config.exclude.has(k)) continue;
    if (config.include && !config.include.has(k)) continue;
    wrapped[k] = v;
  }

  if (Object.keys(wrapped).length === 0) {
    return params;
  }

  const newData = { ...original, [config.key]: new Parameters(wrapped) };
  return new Parameters(newData);
}

export function deriveWrapperKey(controllerName: string): string {
  const name = controllerName.replace(/Controller$/, "").replace(/.*[:/]/, "");
  const singular = name.endsWith("s") ? name.slice(0, -1) : name;
  return singular.charAt(0).toLowerCase() + singular.slice(1);
}
