/**
 * VFS path resolution logic used by the service worker fetch handler.
 * Extracted to a separate module so it can be tested without SW globals.
 */

export interface VfsFileReader {
  read: (path: string) => string | null;
  readCompiled: (path: string) => string | null;
}

/**
 * Resolve a URL path to a VFS file, following Rails conventions:
 * 1. Exact path (prefer compiled JS for .ts files)
 * 2. public/ prefix (Rails public directory is the web root)
 * 3. Extension probing: .ts, .html
 * 4. Directory index: path/index.html, public/path/index.html
 */
export function resolveVfsPath(
  path: string,
  reader: VfsFileReader,
): { path: string; content: string; found: boolean } {
  function tryRead(p: string, wantCompiled: boolean): string | null {
    if (wantCompiled && p.endsWith(".ts")) {
      const js = reader.readCompiled(p);
      if (js != null) return js;
    }
    return reader.read(p);
  }

  // Try exact path (prefer compiled for .ts)
  let content = tryRead(path, true);
  if (content != null) return { path, content, found: true };

  // Try public/ prefix (Rails convention: public/ is the web root)
  content = tryRead(`public/${path}`, false);
  if (content != null) return { path: `public/${path}`, content, found: true };

  // Try extensions: .ts, .html, /index.html (both root and public/)
  if (!path.includes(".")) {
    for (const ext of [".ts", ".html"]) {
      content = tryRead(path + ext, ext === ".ts");
      if (content != null) return { path: path + ext, content, found: true };
    }
    content = tryRead(`${path}/index.html`, false);
    if (content != null) return { path: `${path}/index.html`, content, found: true };

    for (const ext of [".html"]) {
      content = tryRead(`public/${path}${ext}`, false);
      if (content != null) return { path: `public/${path}${ext}`, content, found: true };
    }
    content = tryRead(`public/${path}/index.html`, false);
    if (content != null) return { path: `public/${path}/index.html`, content, found: true };
  }

  return { path, content: "", found: false };
}
