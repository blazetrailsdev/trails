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
 * 2. Neutralize dead relative links in generated pages.
 *    typedoc copies package READMEs and every locally-linked markdown file
 *    (CONTRIBUTING.md, the deviations guides, example READMEs, …) into
 *    `api/_media`, flattening them out of their source directory. Their
 *    relative cross-tree links (`../../README.md`, `./index.md`,
 *    `../../examples/twitter-clone/`) were valid in-repo but resolve to
 *    nothing once relocated, and VitePress treats each as a hard build error.
 *    Rather than rewrite links in every source README (fragile, and recurring
 *    for every new package README), we strip the broken href here — replacing
 *    `[text](dead)` with `text`. We replicate VitePress's own dead-link
 *    resolution so we neutralize *exactly* the links it would flag and leave
 *    valid intra-`api` cross-references (and source-file / asset links)
 *    clickable. The source READMEs keep their working links for humans reading
 *    them in the repo / on GitHub.
 */
import { existsSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcDir = join(__dirname, "..", "docs");
const apiDir = join(srcDir, "api");
const publicDir = join(srcDir, "public");

// Mirrors VitePress's KNOWN_EXTENSIONS / treatAsHtml: a link target is only a
// candidate "page" (and thus dead-link-checked) when it has no extension or a
// .md/.html one. Anything ending in a known asset/source extension (.ts, .png,
// .json, …) is left alone, exactly as VitePress leaves it alone.
const KNOWN_EXTENSIONS = new Set(
  "3g2,3gp,aac,ai,apng,au,avif,bin,bmp,cer,class,conf,crl,css,csv,dll,doc,eps,epub,exe,gif,gz,ics,ief,jar,jpe,jpeg,jpg,js,json,jsonld,m4a,man,mid,midi,mjs,mov,mp2,mp3,mp4,mpe,mpeg,mpg,mpp,oga,ogg,ogv,ogx,opus,otf,p10,p7c,p7m,p7s,pdf,png,ps,qt,roff,rtf,rtx,ser,svg,t,tif,tiff,tr,ts,tsv,ttf,txt,vtt,wav,weba,webm,webp,woff,woff2,xhtml,xml,yaml,yml,zip".split(
    ",",
  ),
);

function treatAsHtml(pathname) {
  const ext = pathname.split(".").pop();
  return ext == null || !KNOWN_EXTENSIONS.has(ext.toLowerCase());
}

/**
 * Returns true if `url` (a markdown link target found in `fileDir`) would be
 * reported as a dead link by VitePress. Mirrors the resolution in
 * vitepress' markdown dead-link plugin.
 */
function isDeadLink(url, fileDir) {
  // External, protocol-relative, mailto/tel, and pure-anchor links are never
  // dead-link-checked by VitePress.
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(url)) return false;
  if (url.startsWith("#")) return false;

  const { pathname } = new URL(url, "http://a.com");
  if (!treatAsHtml(pathname)) return false;

  let clean = url.replace(/[?#].*$/, "").replace(/\.(html|md)$/, "");
  if (clean === "") return false;
  if (clean.endsWith("/")) clean += "index";

  const resolved = clean.startsWith("/")
    ? clean.slice(1)
    : relative(srcDir, resolve(fileDir, clean));

  if (existsSync(join(srcDir, `${resolved}.md`))) return false;
  if (existsSync(join(publicDir, `${resolved}.html`))) return false;
  return true;
}

// Strip the href from dead inline links, keeping the link text. Skips images
// (`![alt](src)`) — those reference assets, not pages.
function neutralizeDeadLinks(content, fileDir) {
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

    result.push(
      line.replace(/(!?)\[([^\]]*)\]\(([^)\s]+)\)/g, (match, bang, text, url) => {
        if (bang) return match; // image — leave alone
        return isDeadLink(url, fileDir) ? text : match;
      }),
    );
  }

  return result.join("\n");
}

function escapeForVue(content) {
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

async function* walkMd(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walkMd(full);
    else if (entry.name.endsWith(".md")) yield full;
  }
}

let count = 0;
for await (const file of walkMd(apiDir)) {
  const original = await readFile(file, "utf8");
  const processed = escapeForVue(neutralizeDeadLinks(original, dirname(file)));
  if (processed !== original) {
    await writeFile(file, processed);
    count++;
  }
}

console.log(`Escaped ${count} files for VitePress compatibility.`);
