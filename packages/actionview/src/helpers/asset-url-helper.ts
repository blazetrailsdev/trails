import { isBlank } from "@blazetrails/activesupport";
import { ArgumentError } from "@blazetrails/ruby-compat";

/**
 * `ActionView::Helpers::AssetUrlHelper`
 * (`actionview/lib/action_view/helpers/asset_url_helper.rb`).
 */

/** `asset_url_helper.rb:122`. */
export const URI_REGEXP = /^[-a-z]+:\/\/|^(?:cid|data):|^\/\//i;

/** `asset_url_helper.rb:229-232`. */
export const ASSET_EXTENSIONS: Record<string, string> = {
  javascript: ".js",
  stylesheet: ".css",
};

/** `asset_url_helper.rb:253-260`. */
export const ASSET_PUBLIC_DIRECTORIES: Record<string, string> = {
  audio: "/audios",
  font: "/fonts",
  image: "/images",
  javascript: "/javascripts",
  stylesheet: "/stylesheets",
  video: "/videos",
};

export interface AssetPathOptions {
  type?: string;
  extname?: string | false;
  skipPipeline?: boolean;
  host?: string | ((source: string, request?: unknown) => string);
  protocol?: string;
}

/**
 * The view members `assetPath` dispatches through. `computeAssetPath` is read
 * off `this` so an asset pipeline's override wins, as Ruby method lookup gives
 * Sprockets and Propshaft their hook.
 */
export interface AssetUrlHelperHost {
  config?: {
    relativeUrlRoot?: string;
    assetHost?: string | ((source: string, request?: unknown) => string);
    defaultAssetHostProtocol?: string;
  } | null;
  request?: { baseUrl: string; protocol: string } | null;
  computeAssetPath(source: string, options?: AssetPathOptions): string;
  publicComputeAssetPath(source: string, options?: AssetPathOptions): string;
}

/** Ruby `File.join` — joins with a single separator between segments. */
function fileJoin(...segments: string[]): string {
  return segments
    .map((segment, index) =>
      index === 0 ? segment.replace(/\/+$/, "") : segment.replace(/^\/+|\/+$/g, ""),
    )
    .join("/");
}

/** Mirrors `AssetUrlHelper#asset_path` (`asset_url_helper.rb:184-217`). */
export function assetPath(
  this: AssetUrlHelperHost,
  source: string | null | undefined,
  options: AssetPathOptions = {},
): string {
  if (source === null || source === undefined) {
    throw new ArgumentError("nil is not a valid asset source");
  }

  source = String(source);
  if (isBlank(source)) return "";
  if (URI_REGEXP.test(source)) return source;

  const tail = /([?#].+)$/.exec(source)?.[1];
  source = source.replace(/([?#].+)$/, "");

  const extname = computeAssetExtname(source, options);
  if (extname !== null) {
    source = `${source}${extname}`;
  }

  if (!source.startsWith("/")) {
    if (options.skipPipeline === true) {
      source = this.publicComputeAssetPath(source, options);
    } else {
      source = this.computeAssetPath(source, options);
    }
  }

  const relativeUrlRoot = this.config?.relativeUrlRoot;
  if (relativeUrlRoot !== null && relativeUrlRoot !== undefined && relativeUrlRoot !== "") {
    if (!source.startsWith(`${relativeUrlRoot}/`)) {
      source = fileJoin(relativeUrlRoot, source);
    }
  }

  const host = computeAssetHost.call(this, source, options);
  if (host !== null && host !== undefined) {
    source = fileJoin(host, source);
  }

  return `${source}${tail ?? ""}`;
}

/** `alias_method :path_to_asset, :asset_path` (`asset_url_helper.rb:218`). */
export const pathToAsset = assetPath;

/** Mirrors `AssetUrlHelper#compute_asset_extname` (`asset_url_helper.rb:236-244`). */
export function computeAssetExtname(source: string, options: AssetPathOptions = {}): string | null {
  if (options.extname === false) return null;
  const extname =
    options.extname ?? (options.type === undefined ? undefined : ASSET_EXTENSIONS[options.type]);
  if (extname !== undefined && extname !== null && extnameOf(source) !== extname) {
    return extname;
  }
  return null;
}

/** Ruby `File.extname` — the final dotted segment of the basename, or `""`. */
function extnameOf(source: string): string {
  const base = source.slice(source.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  return dot <= 0 ? "" : base.slice(dot);
}

/** Mirrors `AssetUrlHelper#compute_asset_path` (`asset_url_helper.rb:265-268`). */
export function computeAssetPath(source: string, options: AssetPathOptions = {}): string {
  const dir =
    (options.type === undefined ? undefined : ASSET_PUBLIC_DIRECTORIES[options.type]) ?? "";
  return fileJoin(dir, source);
}

/** `alias :public_compute_asset_path :compute_asset_path` (`asset_url_helper.rb:269`). */
export const publicComputeAssetPath = computeAssetPath;

/**
 * Mirrors `AssetUrlHelper#compute_asset_host` (`asset_url_helper.rb:275-306`).
 *
 * Ruby branches the callable arm on `arity > 1 || arity < 0`, where a negative
 * arity is a splat. A JS function's `length` excludes rest parameters, so the
 * `arity < 0` half has nothing to read and only `length > 1` survives.
 */
export function computeAssetHost(
  this: AssetUrlHelperHost,
  source = "",
  options: AssetPathOptions = {},
): string | undefined {
  const request = this.request;
  let host = options.host;
  host ??= this.config?.assetHost;

  if (host !== null && host !== undefined && host !== "") {
    if (typeof host === "function") {
      const args: unknown[] = [source];
      if (request && host.length > 1) args.push(request);
      host = (host as (...a: unknown[]) => string)(...args);
    } else if (host.includes("%d")) {
      host = host.replace("%d", String(crc32(source) % 4));
    }
  }

  if (
    (host === null || host === undefined || host === "") &&
    request &&
    options.protocol === ":request"
  ) {
    host = request.baseUrl;
  }
  if (host === null || host === undefined || host === "") return undefined;

  if (URI_REGEXP.test(host)) {
    return host;
  }
  const protocol =
    options.protocol ??
    this.config?.defaultAssetHostProtocol ??
    (request ? ":request" : ":relative");
  switch (protocol) {
    case ":relative":
      return `//${host}`;
    case ":request":
      return `${request!.protocol}${host}`;
    default:
      return `${protocol}://${host}`;
  }
}

/** Ruby `Zlib.crc32` (`asset_url_helper.rb:3`, `:295`). */
function crc32(str: string): number {
  let crc = 0xffffffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) & 0xff;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Mirrors `AssetUrlHelper#stylesheet_path` (`asset_url_helper.rb:348-350`). */
export function stylesheetPath(
  this: AssetUrlHelperHost,
  source: string,
  options: AssetPathOptions = {},
): string {
  return pathToAsset.call(this, source, { type: "stylesheet", ...options });
}

/** `alias_method :path_to_stylesheet, :stylesheet_path` (`asset_url_helper.rb:351`). */
export const pathToStylesheet = stylesheetPath;
