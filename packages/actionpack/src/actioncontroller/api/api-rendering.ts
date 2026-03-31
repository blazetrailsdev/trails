/**
 * ActionController::ApiRendering
 *
 * Rendering module included in API controllers. Overrides the default
 * render to use the API renderer (no template support).
 * @see https://api.rubyonrails.org/classes/ActionController/ApiRendering.html
 */

function resolveContentType(options: Record<string, unknown>, fallback: string): string {
  return (
    (options.contentType as string | undefined) ??
    (options.content_type as string | undefined) ??
    fallback
  );
}

export function renderForApi(options: Record<string, unknown>): {
  body: string;
  contentType: string;
} {
  if (options.json !== undefined) {
    const body =
      typeof options.json === "string" ? options.json : (JSON.stringify(options.json) ?? "null");
    return { body, contentType: resolveContentType(options, "application/json; charset=utf-8") };
  }
  if (options.plain !== undefined) {
    return {
      body: String(options.plain),
      contentType: resolveContentType(options, "text/plain; charset=utf-8"),
    };
  }
  if (options.body !== undefined) {
    return {
      body: String(options.body),
      contentType: resolveContentType(options, "application/octet-stream"),
    };
  }
  return { body: "", contentType: resolveContentType(options, "application/json; charset=utf-8") };
}
