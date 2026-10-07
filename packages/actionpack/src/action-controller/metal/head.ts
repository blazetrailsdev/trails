import { Module, isPlainObject, underscore } from "@blazetrails/activesupport";
import { ArgumentError, hashDelete, rbInspect, rbObjAsString } from "@blazetrails/ruby-compat";
import { Mime, type MimeType } from "../../action-dispatch/http/mime-type.js";
import type { Metal } from "../metal.js";

type HeadHost = Pick<
  Metal,
  "headers" | "urlFor" | "responseCode" | "mediaType" | "response" | "responseBody"
> & {
  set status(value: number | string);
  set location(value: string);
  set contentType(value: string | MimeType | undefined);
  formats?: ReadonlyArray<string>;
  includeContent: typeof includeContent;
};

export function head(
  this: HeadHost,
  status: number | string | null | false,
  options: Record<string, unknown> | null = null,
): true {
  if (isPlainObject(status) || (status as unknown) instanceof Map) {
    throw new ArgumentError(`${rbInspect(status)} is not a valid value for \`status\`.`);
  }

  if (status == null || status === false) status = "ok";

  let location: unknown;
  let contentType: unknown;
  if (options != null) {
    location = hashDelete(options, "location");
    contentType = hashDelete(options, "contentType");

    for (const [key, value] of Object.entries(options)) {
      this.headers.set(
        (/^[a-z][a-zA-Z\d]*$/.test(key) ? underscore(key) : key)
          .split(/[-_]/)
          .map((v) => v[0].toUpperCase() + v.slice(1))
          .join("-"),
        rbObjAsString(value),
      );
    }
  }

  this.status = status;
  if (location != null && location !== false) this.location = this.urlFor(location);

  if (this.includeContent(this.responseCode)) {
    if (this.mediaType == null) {
      let f: ReadonlyArray<string> | undefined;
      this.contentType =
        (contentType != null && contentType !== false ? (contentType as string) : null) ??
        ((f = this.formats) != null ? Mime.get(f[0] ?? null) : null) ??
        Mime.get(":html");
    }

    this.response.charset = false;
  }

  this.responseBody = "";

  return true;
}

/** @internal */
function includeContent(status: number): boolean {
  if (status >= 100 && status <= 199) {
    return false;
  } else if (status === 204 || status === 205 || status === 304) {
    return false;
  } else {
    return true;
  }
}

export const Head: Module<{ head: typeof head }> = new Module((mod) => {
  mod.defineMethod("head", head);
  mod.defineMethod("includeContent", includeContent);
});
