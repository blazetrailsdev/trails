import { isBlank } from "@blazetrails/activesupport";
import { ArgumentError } from "@blazetrails/ruby-compat";

/**
 * ActionView::Helpers::AssetUrlHelper
 *
 * Mirrors `actionview/lib/action_view/helpers/asset_url_helper.rb`.
 */

/** `asset_url_helper.rb:122`. */
export const URI_REGEXP = /^[-a-z]+:\/\/|^(?:cid|data):|^\/\//i;

export interface AssetPathOptions {
  extname?: string | false;
  type?: string;
  skipPipeline?: boolean;
  host?: string | ((source: string, request?: unknown) => string | null | undefined) | null;
  protocol?: string | null;
}

/** `config` slots `AssetUrlHelper` reads (`abstract_controller/asset_paths.rb:5-9`). */
export interface AssetPathsConfig {
  assetHost?: string | ((source: string, request?: unknown) => string | null | undefined) | null;
  relativeUrlRoot?: string | null;
  defaultAssetHostProtocol?: string | null;
}

/** The subset of `request` `compute_asset_host` touches. */
export interface AssetUrlRequest {
  baseUrl?: string;
  protocol?: string;
}

/**
 * The receiver an `AssetUrlHelper` body dispatches back through.
 * `compute_asset_path` documents itself as the method a pipeline overrides to
 * "generate digested paths" (`asset_url_helper.rb:262-265`), so it is looked
 * up on the receiver rather than called as a module-local function.
 */
export interface AssetUrlHelperHost {
  config?: AssetPathsConfig;
  request?: AssetUrlRequest | null;
  computeAssetPath?(source: string, options?: AssetPathOptions): string;
  publicComputeAssetPath?(source: string, options?: AssetPathOptions): string;
  computeAssetHost?(source?: string, options?: AssetPathOptions): string | null;
}

/**
 * Computes the path to an asset in a public directory.
 * `asset_url_helper.rb:187-217`.
 */
export function assetPath(
  this: AssetUrlHelperHost | void,
  source: string | null | undefined,
  options: AssetPathOptions = {},
): string {
  if (source == null) throw new ArgumentError("nil is not a valid asset source");

  source = String(source);
  if (isBlank(source)) return "";
  if (URI_REGEXP.test(source)) return source;

  const tail = /([?#].+)$/.exec(source)?.[1] ?? "";
  source = source.replace(/([?#].+)$/, "");

  const extname = computeAssetExtname(source, options);
  if (extname != null) {
    source = `${source}${extname}`;
  }

  if (!source.startsWith("/")) {
    if (options.skipPipeline === true) {
      source = (this?.publicComputeAssetPath ?? publicComputeAssetPath).call(this, source, options);
    } else {
      source = (this?.computeAssetPath ?? computeAssetPath).call(this, source, options);
    }
  }

  const relativeUrlRoot = this?.config?.relativeUrlRoot;
  if (relativeUrlRoot != null) {
    if (!source.startsWith(`${relativeUrlRoot}/`)) source = fileJoin(relativeUrlRoot, source);
  }

  const host = (this?.computeAssetHost ?? computeAssetHost).call(this, source, options);
  if (host != null) {
    source = fileJoin(host, source);
  }

  return `${source}${tail}`;
}

/** `alias_method :path_to_asset, :asset_path` (`asset_url_helper.rb:219`). */
export const pathToAsset = assetPath;

/** `asset_url_helper.rb:236-239`. */
export const ASSET_EXTENSIONS: Record<string, string> = {
  javascript: ".js",
  stylesheet: ".css",
};

/**
 * Compute extname to append to asset path. Returns `null` if
 * nothing should be added. `asset_url_helper.rb:243-251`.
 */
export function computeAssetExtname(source: string, options: AssetPathOptions = {}): string | null {
  if (options.extname === false) return null;
  const extname = options.extname || (options.type != null ? ASSET_EXTENSIONS[options.type] : null);
  if (extname != null && extname !== "" && fileExtname(source) !== extname) {
    return extname;
  } else {
    return null;
  }
}

/** Maps asset types to public directory. `asset_url_helper.rb:254-261`. */
export const ASSET_PUBLIC_DIRECTORIES: Record<string, string> = {
  audio: "/audios",
  font: "/fonts",
  image: "/images",
  javascript: "/javascripts",
  stylesheet: "/stylesheets",
  video: "/videos",
};

/**
 * Computes asset path to public directory. Plugins and
 * extensions can override this method to point to custom assets
 * or generate digested paths or query strings.
 * `asset_url_helper.rb:266-269`.
 */
export function computeAssetPath(source: string, options: AssetPathOptions = {}): string {
  const dir = (options.type != null ? ASSET_PUBLIC_DIRECTORIES[options.type] : null) || "";
  return fileJoin(dir, source);
}

/** `alias :public_compute_asset_path :compute_asset_path` (`asset_url_helper.rb:270`). */
export const publicComputeAssetPath = computeAssetPath;

/**
 * Pick an asset host for this source. Returns `null` if no host is set,
 * the host if no wildcard is set, the host interpolated with the
 * numbers 0-3 if it contains `%d` (the number is the source hash mod 4),
 * or the value returned from invoking call on an object responding to call.
 * `asset_url_helper.rb:277-310`.
 *
 * Ruby's `arity < 0` arm (a splat-argument host, which also receives the
 * request) has no JS counterpart: a rest-parameter function reports
 * `Function.length` 0, indistinguishable from a zero-arity one, so only the
 * `arity > 1` arm survives.
 */
export function computeAssetHost(
  this: AssetUrlHelperHost | void,
  source: string = "",
  options: AssetPathOptions = {},
): string | null {
  const request = this?.request;
  let host: string | null | undefined;
  const configured = options.host ?? this?.config?.assetHost;

  if (configured != null) {
    if (typeof configured === "function") {
      const arity = configured.length;
      const args: [string, unknown?] = [source];
      if (request != null && arity > 1) args.push(request);
      host = configured(...args);
    } else if (configured.includes("%d")) {
      host = configured.replace("%d", String(crc32(source) % 4));
    } else {
      host = configured;
    }
  }

  host ??= request != null && options.protocol === ":request" ? request.baseUrl : undefined;
  if (host == null) return null;

  if (URI_REGEXP.test(host)) {
    return host;
  } else {
    const protocol =
      options.protocol ??
      this?.config?.defaultAssetHostProtocol ??
      (request ? ":request" : ":relative");
    switch (protocol) {
      case ":relative":
        return `//${host}`;
      case ":request":
        return `${request?.protocol ?? ""}${host}`;
      default:
        return `${protocol.replace(/^:/, "")}://${host}`;
    }
  }
}

/**
 * Computes the path to a stylesheet asset in the public stylesheets directory.
 * `asset_url_helper.rb:348-350`.
 */
export function stylesheetPath(
  this: AssetUrlHelperHost | void,
  source: string,
  options: AssetPathOptions = {},
): string {
  return pathToAsset.call(this, source, { type: "stylesheet", ...options });
}

/** `alias_method :path_to_stylesheet, :stylesheet_path` (`asset_url_helper.rb:351`). */
export const pathToStylesheet = stylesheetPath;

/** `File.extname` — the trailing `.ext` of the basename, or `""`. */
function fileExtname(source: string): string {
  const dot = source.lastIndexOf(".");
  const slash = source.lastIndexOf("/");
  return dot > slash + 1 ? source.slice(dot) : "";
}

/** `File.join` — join with a single separator, collapsing doubled ones. */
function fileJoin(...parts: string[]): string {
  return parts
    .filter((part) => part !== "")
    .reduce((joined, part) =>
      joined.endsWith("/") || part.startsWith("/")
        ? `${joined.replace(/\/$/, "")}/${part.replace(/^\//, "")}`
        : `${joined}/${part}`,
    );
}

/** `Zlib.crc32`. */
function crc32(source: string): number {
  let crc = ~0;
  for (let i = 0; i < source.length; i++) {
    crc ^= source.charCodeAt(i) & 0xff;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return ~crc >>> 0;
}
