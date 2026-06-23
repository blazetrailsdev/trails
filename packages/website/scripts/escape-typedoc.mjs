/**
 * Post-processes typedoc-generated markdown to be VitePress-compatible.
 *
 * Two transforms, both scoped to the generated `docs/api` tree only — authored
 * docs (guides/, root index, …) are never touched, so genuine dead links there
 * still fail the build.
 *
 * 1. Escape angle brackets for the Vue SFC parser.
 *    VitePress compiles markdown as Vue SFC templates. The Vue SFC parser must
 *    successfully parse the entire template before any directives (like v-pre)
 *    take effect. TypeScript generics (Array<T>), JSDoc HTML examples (<script>,
 *    <br>), and type signatures all produce angle brackets that break parsing.
 *    Fix: escape all `<` outside fenced code blocks to `&lt;`, so nothing looks
 *    like an HTML tag to the Vue parser.
 *
 * 2. Repoint dead relative links in generated pages at working GitHub URLs.
 *    typedoc copies package READMEs and every locally-linked markdown file
 *    (CONTRIBUTING.md, the deviations guides, example READMEs, …) into
 *    `api/_media`, flattening them out of their source directory. Their
 *    relative cross-tree links (`../../README.md`, `./index.md`,
 *    `../../examples/twitter-clone/`) were valid in-repo but resolve to nothing
 *    once relocated, and VitePress treats each as a hard build error. Editing
 *    every source README is fragile and recurs for every new package README,
 *    and for the deviations guides the relative links are *correct* for the
 *    live site — so instead we fix the generated copies: each dead link is
 *    repointed at an absolute `github.com/.../blob/main/<path>` URL that
 *    resolves both for site visitors and for humans reading the repo. We find
 *    each generated file's repo origin by content (the prose is identical to
 *    source; only some link hrefs differ, which we strip before hashing), then
 *    resolve the original relative link against that origin. Links VitePress
 *    can already resolve (valid intra-`api` cross-references, source-file /
 *    asset links) are left untouched; the rare link we cannot map to a real
 *    repo path falls back to stripping the href, keeping the link text.
 *
 * The pure transforms are exported for unit testing; the filesystem walk and
 * repo-origin indexing only run when this file is executed directly.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const GITHUB_REPO = "https://github.com/blazetrailsdev/trails";
const GITHUB_BRANCH = "main";
const MEDIA_PREFIX = "api/_media/";

const toPosix = (p) => p.split("\\").join("/");

// Mirrors VitePress's KNOWN_EXTENSIONS / treatAsHtml: a link target is only a
// candidate "page" (and thus dead-link-checked) when it has no extension or a
// .md/.html one. Anything ending in a known asset/source extension (.ts, .png,
// .json, …) is left alone, exactly as VitePress leaves it alone.
const KNOWN_EXTENSIONS = new Set(
  "3g2,3gp,aac,ai,apng,au,avif,bin,bmp,cer,class,conf,crl,css,csv,dll,doc,eps,epub,exe,gif,gz,ics,ief,jar,jpe,jpeg,jpg,js,json,jsonld,m4a,man,mid,midi,mjs,mov,mp2,mp3,mp4,mpe,mpeg,mpg,mpp,oga,ogg,ogv,ogx,opus,otf,p10,p7c,p7m,p7s,pdf,png,ps,qt,roff,rtf,rtx,ser,svg,t,tif,tiff,tr,ts,tsv,ttf,txt,vtt,wav,weba,webm,webp,woff,woff2,xhtml,xml,yaml,yml,zip".split(
    ",",
  ),
);

export function treatAsHtml(pathname) {
  const ext = pathname.split(".").pop();
  return ext == null || !KNOWN_EXTENSIONS.has(ext.toLowerCase());
}

const isExternal = (url) => /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(url) || url.startsWith("#");

/**
 * VitePress's own resolution: returns the srcDir-relative page path (no
 * extension) a link points at, or null when VitePress would not dead-link-check
 * it (external, anchor, or an asset/source extension). `fileDir` is the link's
 * containing directory, relative to srcDir.
 */
export function resolveTarget(url, fileDir) {
  if (isExternal(url)) return null;
  const { pathname } = new URL(url, "http://a.com");
  if (!treatAsHtml(pathname)) return null;

  let clean = url.replace(/[?#].*$/, "").replace(/\.(html|md)$/, "");
  if (clean === "") return null;
  if (clean.endsWith("/")) clean += "index";

  return clean.startsWith("/") ? clean.slice(1) : toPosix(relative(".", join(fileDir, clean)));
}

/**
 * True when VitePress would report `url` (found in a page under srcDir-relative
 * `fileDir`) as a dead link. `pageExists(resolvedPath)` decides whether a
 * resolved path maps to a real page — injected so resolution is unit-testable
 * without a tree.
 */
export function isDeadLink(url, fileDir, pageExists) {
  const resolved = resolveTarget(url, fileDir);
  if (resolved == null) return false;
  return !pageExists(resolved);
}

/**
 * Given a dead link, returns an absolute GitHub URL that resolves to the real
 * repo file/dir, or null when it cannot be mapped (caller then strips the
 * href). `ctx`:
 *   - originDir: the link's source file repo dir (POSIX, "" = repo root), or
 *     null if the file's origin is unknown.
 *   - mediaEntryToRepo(entry): repo path for a copied `_media/<entry>`, or null.
 *   - repoKind(repoPath): "file" | "dir" | null (does it exist, and which).
 */
export function rewriteDeadLink(url, fileDir, ctx) {
  const resolved = resolveTarget(url, fileDir);
  if (resolved == null) return null;
  const frag = (url.match(/#.*$/) || [""])[0];

  // A flattened `_media` copy carries its source's relative links verbatim;
  // an index page (rendered package README) sits elsewhere and has typedoc-
  // rewritten `_media/<entry>` links. They map back to the repo differently.
  const fileIsMedia = fileDir === "api/_media" || fileDir.startsWith("api/_media/");

  let repoTarget = null;
  if (!fileIsMedia && resolved.startsWith(MEDIA_PREFIX)) {
    // Points at another copied media entry VitePress won't serve as a page (a
    // directory, or a non-page file like LICENSE). Map the entry to its origin.
    repoTarget = ctx.mediaEntryToRepo(resolved.slice(MEDIA_PREFIX.length));
  } else if (ctx.originDir != null) {
    // A verbatim original link: resolve it against the file's source directory.
    const bare = url.replace(/[?#].*$/, "");
    const joined = toPosix(relative(".", join(ctx.originDir, bare)));
    repoTarget = joined.startsWith("..") ? null : joined;
  }

  if (!repoTarget) return null;
  const kind = ctx.repoKind(repoTarget);
  if (!kind) return null;

  const route = kind === "dir" ? "tree" : "blob";
  const encoded = repoTarget.split("/").map(encodeURIComponent).join("/");
  return `${GITHUB_REPO}/${route}/${GITHUB_BRANCH}/${encoded}${frag}`;
}

// A flattened `_media` copy carries its source's relative links verbatim, so
// every page-like link's in-place target is meaningless — it must be resolved
// against the content origin, not VitePress's dead-link verdict. A relocated
// link can coincidentally resolve to a *different* existing generated page
// (e.g. depth-2 `../../README.md` -> `api/README`), which VitePress does not
// flag yet points at the wrong doc.
export function isMediaCopy(fileDir) {
  return fileDir === "api/_media" || fileDir.startsWith("api/_media/");
}

/**
 * Resolver verdict for a single link in a generated page: `undefined` = keep,
 * a string = repoint at that URL, `null` = strip the href to plain text.
 * `dead` is VitePress's own dead-link verdict (from `isDeadLink`).
 *
 * In a `_media` copy, repoint any link that maps back to a real repo path via
 * origin resolution regardless of `dead`; only fall back to the dead-only gate
 * when the link is unmappable. Outside `_media` (typedoc-managed index pages),
 * keep the dead-only gate so legitimately-resolving cross-references are left
 * alone.
 */
export function resolveGeneratedLink(url, fileDir, ctx, dead) {
  if (isMediaCopy(fileDir)) {
    const working = rewriteDeadLink(url, fileDir, ctx);
    if (working) return working;
    return dead ? null : undefined;
  }
  if (!dead) return undefined;
  return rewriteDeadLink(url, fileDir, ctx);
}

// Ranges [start, end) of inline code spans in `line` (delimited by matching
// backtick runs). Used to tell a real link from link-like text that is merely
// literal code — e.g. typedoc renders `this.controller[name](...args)` as one
// code span, where `[name](...args)` is NOT a link.
export function codeSpanRanges(line) {
  const ranges = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === "`") {
      let j = i;
      while (line[j] === "`") j++;
      const close = line.indexOf(line.slice(i, j), j);
      if (close !== -1) {
        const end = close + (j - i);
        ranges.push([i, end]);
        i = end;
        continue;
      }
    }
    i++;
  }
  return ranges;
}

/**
 * Rewrites dead relative links in `content`: repoint at a working URL when
 * `resolveLink(url)` returns one, otherwise strip the href to plain text.
 * Skips fenced code blocks, images (asset references), and link-like text whose
 * opening `[` sits inside an inline code span. A link label may itself contain
 * code (`[`code`](url)`), so only the bracket position is checked, per CommonMark.
 */
export function fixDeadLinks(content, resolveLink) {
  const lines = content.split("\n");
  let inFencedBlock = false;
  const result = [];

  for (const line of lines) {
    if (line.startsWith("```")) {
      inFencedBlock = !inFencedBlock;
      result.push(line);
      continue;
    }
    if (inFencedBlock) {
      result.push(line);
      continue;
    }

    const spans = codeSpanRanges(line);
    const inCode = (idx) => spans.some(([s, e]) => idx >= s && idx < e);

    result.push(
      line.replace(/(!?)\[([^\]]*)\]\(([^)\s]+)\)/g, (match, bang, text, url, offset) => {
        if (bang) return match; // image — leave alone
        if (inCode(offset + bang.length)) return match; // literal code, not a link
        const replacement = resolveLink(url);
        if (replacement === undefined) return match; // live link — keep
        if (replacement === null) return text; // dead, unmappable — strip href
        return `[${text}](${replacement})`; // dead — repoint at working URL
      }),
    );
  }

  return result.join("\n");
}

export function escapeForVue(content) {
  const lines = content.split("\n");
  let inFencedBlock = false;
  const result = [];

  for (const line of lines) {
    if (line.startsWith("```")) {
      inFencedBlock = !inFencedBlock;
      result.push(line);
      continue;
    }

    if (inFencedBlock) {
      result.push(line);
      continue;
    }

    result.push(line.replace(/</g, "&lt;"));
  }

  return result.join("\n");
}

// Normalize away the only differences between a generated copy and its source:
// link hrefs (typedoc rewrites some to _media) and whitespace. What remains is
// the prose, which is identical — a reliable fingerprint for origin matching.
const normalizeForHash = (content) =>
  createHash("sha1")
    .update(
      content
        .replace(/\]\([^)]*\)/g, "]")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .digest("hex");

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue; // copied example deps — never relevant
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile()) yield full;
  }
}

async function main() {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const srcDir = join(scriptDir, "..", "docs");
  const apiDir = join(srcDir, "api");
  const mediaDir = join(apiDir, "_media");
  const publicDir = join(srcDir, "public");
  const repoRoot = resolve(scriptDir, "..", "..", "..");

  // --- Index repo files once for content-based origin matching. ---
  const IGNORE = new Set([".git", "node_modules", "dist", "coverage", ".svelte-kit", "build"]);
  const mdHashToRepo = new Map(); // normalized prose hash -> repo path (null if ambiguous)
  const repoByBasename = new Map(); // basename -> repo paths (for cheap raw-content matching)
  async function* walkRepo(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (IGNORE.has(entry.name)) continue;
      const full = join(dir, entry.name);
      if (full === apiDir) continue; // never match against generated output
      if (entry.isDirectory()) yield* walkRepo(full);
      else if (entry.isFile()) yield full;
    }
  }
  for await (const file of walkRepo(repoRoot)) {
    const repoPath = toPosix(relative(repoRoot, file));
    const byName = repoByBasename.get(basename(file));
    if (byName) byName.push(repoPath);
    else repoByBasename.set(basename(file), [repoPath]);
    if (!file.endsWith(".md")) continue;
    const hash = normalizeForHash(await readFile(file, "utf8"));
    mdHashToRepo.set(hash, mdHashToRepo.has(hash) ? null : repoPath);
  }

  // Match a non-markdown copied media file (e.g. LICENSE) to its repo origin by
  // raw byte content, restricted to repo files sharing its basename.
  const matchRawOrigin = (absFile) => {
    const target = readFileSync(absFile);
    for (const repoPath of repoByBasename.get(basename(absFile)) ?? []) {
      if (readFileSync(join(repoRoot, repoPath)).equals(target)) return repoPath;
    }
    return null;
  };

  const repoKind = (repoPath) => {
    const abs = join(repoRoot, repoPath);
    if (!existsSync(abs)) return null;
    return statSync(abs).isDirectory() ? "dir" : "file";
  };

  // Origin (repo path) of each generated markdown file, by prose hash.
  const originOf = (absFile) => mdHashToRepo.get(normalizeForHash(readFileSync(absFile, "utf8")));

  // --- Map each copied `_media/<entry>` back to its repo origin. ---
  // Files match by content; directories inherit their matched children's dir.
  const mediaFileToRepo = new Map(); // "twitter-clone/README" / "LICENSE" -> repo path
  const mediaDirToRepo = new Map(); // "twitter-clone" -> "examples/twitter-clone"
  if (existsSync(mediaDir)) {
    for await (const file of walk(mediaDir)) {
      const relMedia = toPosix(relative(mediaDir, file));
      // Dependency trees copied alongside an example are never link targets.
      if (relMedia.split("/").includes("node_modules")) continue;
      const isMd = relMedia.endsWith(".md");
      const repoPath = isMd
        ? mdHashToRepo.get(normalizeForHash(await readFile(file, "utf8")))
        : matchRawOrigin(file);
      if (!repoPath) continue;
      mediaFileToRepo.set(isMd ? relMedia.replace(/\.md$/, "") : relMedia, repoPath);
      // Record the directory mapping for the entry's parent (e.g. a link to
      // `_media/twitter-clone` resolves via its README child).
      const relDir = dirname(relMedia);
      const repoDir = dirname(repoPath);
      if (relDir !== "." && !mediaDirToRepo.has(relDir)) mediaDirToRepo.set(relDir, repoDir);
    }
  }
  const mediaEntryToRepo = (entry) =>
    mediaFileToRepo.get(entry) ?? mediaDirToRepo.get(entry) ?? null;

  const pageExists = (resolved) =>
    existsSync(resolve(srcDir, `${resolved}.md`)) ||
    existsSync(resolve(publicDir, `${resolved}.html`));

  let repointed = 0;
  let stripped = 0;
  let escaped = 0;
  for await (const file of walk(apiDir)) {
    if (!file.endsWith(".md")) continue;
    const fileDir = toPosix(relative(srcDir, dirname(file)));
    const original = await readFile(file, "utf8");

    const origin = originOf(file);
    const ctx = {
      originDir: origin == null ? null : dirname(origin) === "." ? "" : dirname(origin),
      mediaEntryToRepo,
      repoKind,
    };
    const resolveLink = (url) => {
      const dead = isDeadLink(url, fileDir, pageExists);
      const result = resolveGeneratedLink(url, fileDir, ctx, dead);
      if (result === undefined) return undefined; // keep
      if (result) {
        repointed++;
        return result;
      }
      stripped++;
      console.warn(`  unmapped dead link "${url}" in ${fileDir} — stripped to text`);
      return null; // strip
    };

    const processed = escapeForVue(fixDeadLinks(original, resolveLink));
    if (processed !== original) {
      await writeFile(file, processed);
      escaped++;
    }
  }

  console.log(
    `Post-processed ${escaped} files: ${repointed} dead links repointed at GitHub, ${stripped} stripped.`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
