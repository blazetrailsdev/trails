/** The files that differ from the template: a changed or new file's text, or `null` for a deleted one. */
export type Changes = Record<string, string | null>;

export function changesFrom(
  template: Record<string, string>,
  files: Record<string, string>,
): Changes {
  const changes: Changes = {};
  for (const path of new Set([...Object.keys(template), ...Object.keys(files)])) {
    if (files[path] !== template[path]) changes[path] = files[path] ?? null;
  }
  return changes;
}

export function applyChanges(
  template: Record<string, string>,
  changes: Changes,
): Record<string, string> {
  const files = { ...template };
  for (const [path, text] of Object.entries(changes)) {
    if (text === null) delete files[path];
    else files[path] = text;
  }
  return files;
}

/** Whether a path names a file the editor can hold: absolute, with no `..` step and no trailing slash. */
export function isFilePath(path: string): boolean {
  return (
    path.startsWith("/") &&
    !path.endsWith("/") &&
    path.split("/").every((part, i) => i === 0 || (part !== "" && part !== ".."))
  );
}

async function pipe(bytes: Uint8Array, through: CompressionStream | DecompressionStream) {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(through);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** The changes as the text of a link's fragment: deflated JSON in URL-safe base64. */
export async function encodeChanges(changes: Changes): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(changes));
  const packed = await pipe(json, new CompressionStream("deflate-raw"));
  let binary = "";
  for (const byte of packed) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export async function decodeChanges(text: string): Promise<Changes> {
  const binary = atob(text.replaceAll("-", "+").replaceAll("_", "/"));
  const packed = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  const json = await pipe(packed, new DecompressionStream("deflate-raw"));
  const changes: unknown = JSON.parse(new TextDecoder().decode(json));
  if (typeof changes !== "object" || changes === null || Array.isArray(changes)) {
    throw new Error("not a set of files");
  }
  for (const [path, value] of Object.entries(changes)) {
    if (!isFilePath(path) || (value !== null && typeof value !== "string")) {
      throw new Error("not a set of files");
    }
  }
  return changes as Changes;
}
