# `@blazetrails/nokogiri` plan

Rails parallel: [nokogiri](https://github.com/sparklemotion/nokogiri) (libxml2
bindings). v1 is scoped to **actionpack assertions + activesupport XmlMini
backends only**. HTML parsing, CSS selectors, mutation, and actiontext usage
are explicitly deferred (see [Future expansion](#future-expansion-actiontext)).

## Engine choice

[`libxml2-wasm`](https://github.com/jameslan/libxml2-wasm) `^0.7` — the real
libxml2 C library compiled to WebAssembly. Single dependency, zero transitive
deps, MIT license.

**Why libxml2-wasm?**

- **Same parser as Nokogiri.** Nokogiri wraps libxml2 via native C bindings;
  libxml2-wasm wraps the same library via WASM. Identical parsing behavior
  eliminates edge-case divergence risk that pure-JS parsers (xmldom,
  htmlparser2) carry.
- **Runs everywhere.** Node 18+, browsers (Chrome 89+, Safari 15+), Bun,
  Deno. No native addon, no recompile per Node version. Aligns with the
  [browser-compat plan](browser-compat-plan.md).
- **Zero deps.** The WASM binary is embedded inline (~1 MB uncompressed,
  ~400 KB gzipped). No transitive dependency tree to audit.

**No SAX API.** libxml2-wasm is DOM-only. Rails' `XmlMini_NokogiriSAX`
backend uses SAX for performance on large payloads, but the actual usage
pattern is synchronous one-shot `parse(data)` on request bodies. We
implement the SAX interface by walking the DOM tree and emitting callbacks
— same output, same synchronous contract, backed by the real libxml2
parser. If streaming SAX on truly large documents becomes a need, we can
add htmlparser2 as an optional second engine later.

**`dispose()` requirement.** libxml2-wasm allocates in WASM linear memory;
every `XmlDocument` must be `dispose()`d or it leaks. Both `parseXml()`
and `XML.Document.parse()` return an `XmlDocument` that the caller must
dispose. The portable pattern is `try/finally` + explicit `.dispose()`:

```ts
const doc = parseXml(data);
try {
  // traverse doc.root…
} finally {
  doc.dispose();
}
```

`SaxParser.parse()` handles disposal internally — it parses, walks the
tree emitting callbacks, and disposes before returning. Consumers of the
SAX path never see the WASM document.

**ESM + top-level await.** libxml2-wasm initializes its WASM module via
top-level await on import. Our package re-exports through a lazy init
pattern so consumers that never call XML parsing don't pay the init cost,
and bundlers that don't support TLA can still import the package.

## Consumers (actionpack + activesupport only)

| Rails consumer                          | What it uses                                  |
| --------------------------------------- | --------------------------------------------- |
| actionpack `assertions.rb`              | `XML::Document.parse(body)` for XML responses |
| activesupport `xml_mini/nokogiri.rb`    | `Nokogiri::XML(data)` → DOM → `to_hash`       |
| activesupport `xml_mini/nokogirisax.rb` | `SAX::Parser` + `SAX::Document` handler       |

**Important:** the `to_hash` traversal lives in
`active_support/xml_mini/nokogiri.rb`, not in Nokogiri itself. Our package
mirrors that boundary — `toHash` is **not** on `XML.Document` / `XML.Node`;
it stays in `activesupport/src/xml-mini/nokogiri-engine.ts` as a free
function consuming `XML.Node`.

## Package layout

```
packages/nokogiri/
  package.json            # name: @blazetrails/nokogiri
  src/
    index.ts              # public re-exports as `XML` + `SAX` namespaces
    xml/
      document.ts         # XmlDocument — wraps libxml2-wasm XmlDocument
      node.ts             # XmlNode — wraps libxml2-wasm node types
      parse.ts            # parseXml() — convenience parse with lazy WASM init
    sax/
      document.ts         # SaxDocument — handler base class
      parser.ts           # SaxParser — DOM-walk emitting SAX callbacks
    *.test.ts
```

`index.ts` barrel:

```ts
import { XmlDocument } from "./xml/document.js";
import { XmlNode } from "./xml/node.js";
import { parseXml } from "./xml/parse.js";
import { SaxDocument } from "./sax/document.js";
import { SaxParser } from "./sax/parser.js";

export const XML = { Document: XmlDocument, Node: XmlNode };
export const SAX = { Document: SaxDocument, Parser: SaxParser };
export { parseXml };
export type { XmlNode, XmlDocument, SaxDocument, SaxParser };
```

## Public surface

### Namespace mapping

| Nokogiri (Ruby)                | trails           |
| ------------------------------ | ---------------- |
| `Nokogiri::XML::Document`      | `XML.Document`   |
| `Nokogiri::XML::Node`          | `XML.Node`       |
| `Nokogiri::XML::SAX::Parser`   | `SAX.Parser`     |
| `Nokogiri::XML::SAX::Document` | `SAX.Document`   |
| `Nokogiri::XML(data)`          | `parseXml(data)` |

camelCase per CLAUDE.md: Ruby `element?` → `isElement()`, `cdata?` →
`isCdata()`, `attribute_nodes` → `attributeNodes`, etc.

### XML.Document

Wraps `libxml2-wasm`'s `XmlDocument.fromString()`. Holds a reference to
the WASM document for traversal; must be disposed after use.

```ts
class XmlDocument {
  static parse(data: string): XmlDocument;
  root: XmlNode;
  errors: ReadonlyArray<XmlError>;
  dispose(): void;
}

interface XmlError {
  level: "warning" | "error" | "fatal";
  message: string;
  line?: number;
  column?: number;
}
```

**Error semantics.** libxml2-wasm throws on fatal parse errors by default.
We catch the error and populate the `errors` array, matching Nokogiri's
behavior where `doc.errors` collects all errors/warnings and the consumer
decides whether to raise.

Rails usage:

```ruby
# actionpack — assertions.rb:19
Nokogiri::XML::Document.parse(@response.body)

# activesupport — xml_mini/nokogiri.rb:27-28
doc = Nokogiri::XML(data)
raise doc.errors.first if doc.errors.length > 0
doc.to_hash   # monkeypatch — see "Consumers" note above
```

### XML.Node

Wraps libxml2-wasm's node types behind a uniform interface. Only the
methods our consumers call:

```ts
class XmlNode {
  name: string; // elem.name for elements; "#text"/"#cdata-section" otherwise
  isElement(): boolean; // instanceof XmlElement
  isText(): boolean; // instanceof XmlText
  isCdata(): boolean; // instanceof XmlCData
  content: string; // node.content — text content, recursive for elements
  children: XmlNode[]; // built from firstChild + next linked-list walk
  attributeNodes: AttrNode[]; // from elem.attrs
}

interface AttrNode {
  nodeName: string; // attr.name
  value: string; // attr.value
}
```

**libxml2-wasm mapping:**

| Our API               | libxml2-wasm               | Notes               |
| --------------------- | -------------------------- | ------------------- |
| `node.name`           | `elem.name`                | Direct              |
| `node.isElement()`    | `instanceof XmlElement`    | Type check          |
| `node.isText()`       | `instanceof XmlText`       | Type check          |
| `node.isCdata()`      | `instanceof XmlCData`      | Type check          |
| `node.content`        | `node.content`             | Direct              |
| `node.children`       | `firstChild` + `next` loop | Linked list → array |
| `node.attributeNodes` | `elem.attrs`               | Direct array        |
| `attr.nodeName`       | `attr.name`                | Rename              |
| `attr.value`          | `attr.value`               | Direct              |

Rails usage (all from `xml_mini/nokogiri.rb`):

```ruby
children.each do |c|
  if c.element?
    c.to_hash(node_hash)
  elsif c.text? || c.cdata?
    node_hash[CONTENT_ROOT] << c.content
  end
end
attribute_nodes.each { |a| node_hash[a.node_name] = a.value }
```

### SAX.Document

Base class — consumer subclasses and overrides callbacks (Nokogiri-shape):

```ts
class SaxDocument {
  startDocument(): void {}
  endDocument(): void {}
  startElement(name: string, attrs: ReadonlyArray<[string, string]>): void {}
  endElement(name: string): void {}
  characters(text: string): void {}
  cdataBlock(text: string): void {}
  error(message: string): void {}
}
```

**`attrs` shape.** Nokogiri's `SAX::Parser` callback receives
`[[name, value], …]` tuples. We pass the same `[string, string][]` shape;
if a future consumer needs namespaces, expand without breaking back-compat.

### SAX.Parser

Implements SAX by DOM-walking the libxml2-wasm parse tree and emitting
callbacks in document order:

```ts
class SaxParser {
  constructor(handler: SaxDocument);
  parse(data: string): void;
}
```

Internally: `parse()` calls `XmlDocument.fromString(data)`, walks the
tree depth-first emitting `startElement`/`endElement`/`characters`/
`cdataBlock` callbacks, then `dispose()`s the document. The handler
receives the same event sequence as Nokogiri's SAX parser. CDATA nodes
dispatch `cdataBlock`, text nodes dispatch `characters`.

Rails usage (`xml_mini/nokogirisax.rb`):

```ruby
parser = Nokogiri::XML::SAX::Parser.new(document)
parser.parse(data)
```

### parseXml()

Convenience function mirroring `Nokogiri::XML(data)`. Parses and returns
an `XmlDocument` that the caller must dispose:

```ts
function parseXml(data: string): XmlDocument;
```

## Dependencies

- Runtime: `libxml2-wasm` `^0.7`. ESM-only, MIT license, zero transitive
  deps. WASM binary is ~1 MB uncompressed (~400 KB gzipped), embedded
  inline.
- Dev: workspace `vitest` only.

## LOC budget

| Component                                        | LOC | Where               |
| ------------------------------------------------ | --- | ------------------- |
| `XmlDocument` (parse, errors, dispose)           | 50  | xml/document.ts     |
| `XmlNode` (predicates, content, children, attrs) | 50  | xml/node.ts         |
| `parseXml` + lazy init + `index.ts` barrel       | 40  | xml/parse.ts, index |
| `SaxDocument` base class                         | 25  | sax/document.ts     |
| `SaxParser` DOM-walk emitter                     | 60  | sax/parser.ts       |
| Tests                                            | 75  | \*.test.ts          |

**Total: ~300 LOC in a single PR.** The DOM and SAX surfaces share the
same libxml2-wasm engine and parse path, so splitting into two PRs would
create artificial boundaries. Ships as one PR under the 300-LOC ceiling.

## api:compare

Nokogiri is a standalone gem (not part of the Rails monorepo), so it's
not in `vendor/rails/`. Adding it to `vendor/sources.ts` and api:compare
is not worth the extractor complexity for a ~10-method surface. Parity is
tracked manually via this plan doc and the test suite. If the surface
grows significantly (actiontext expansion), revisit.

## Implementation sequence

### PR 1 — nokogiri package (~300 LOC)

- New package: `packages/nokogiri/` with `package.json`,
  `tsconfig.json`, `vitest.config.ts`.
- `XmlDocument.parse` with error collection + `dispose()`.
- `XmlNode` wrapper: `name`, `isElement()`, `isText()`, `isCdata()`,
  `content`, `children`, `attributeNodes`.
- `parseXml(data)` convenience function with lazy WASM init.
- `SaxDocument` base class with all 7 callbacks.
- `SaxParser` DOM-walk emitter.
- Wire the XML branch of `htmlDocument()` in
  `actionpack/src/action-dispatch/testing/assertions.ts` (the HTML branch
  depends on `rails-dom-testing` and remains deferred).
- Wire into activesupport `xml-mini/nokogiri-engine.ts` with `toHash`
  traversal.
- Wire into activesupport `xml-mini/nokogiri-sax-engine.ts`.
- Tests: parse → traverse → attrs → malformed errors; SAX produces
  identical hash output to DOM `toHash`; CDATA handling.

## Future expansion (actiontext)

When actiontext is in scope, this package will need:

- HTML parsing (libxml2 supports HTML via `htmlReadMemory` — check if
  libxml2-wasm exposes this, otherwise add htmlparser2 as a second engine
  for the HTML namespace only).
- `.css()` selector support (XPath is available via libxml2-wasm's
  `find()`/`get()` — could translate simple CSS selectors to XPath, or
  add `css-select` for the htmlparser2 HTML path).
- Node mutation (`.replace()`, `.innerHtml`, `.remove()`, `.dup()`).
- Element/attribute bracket access, `.createElement()`, `.fragment()`.
- `SaveOptions.AS_HTML` serialization flag.

The `xml/` + `sax/` layout accommodates adding `html/` later without
breaking the v1 XML API.

## Non-goals (v1)

- HTML parsing (deferred to actiontext).
- CSS selectors (deferred).
- XPath exposure (libxml2-wasm supports it, but no Rails consumer uses
  XPath in the v1 scope — keep it internal).
- XSLT.
- Encoding detection beyond UTF-8.
- Full Nokogiri API coverage — only the methods Rails calls.
- Mutation API (`replace`, `remove`, `innerHTML=`, etc.).

## Wire-up checklist

- [ ] `packages/nokogiri/package.json` registered in workspace
- [ ] `XmlDocument.parse` returns instance with `root` + `errors` + `dispose()`
- [ ] `XmlNode` predicates / `content` / `children` / `attributeNodes`
- [ ] `parseXml(data)` convenience export with lazy WASM init
- [ ] `SaxDocument` base class with all 7 callbacks
- [ ] `SaxParser(handler).parse(data)` via DOM-walk
- [ ] `XML` / `SAX` namespace barrel in `index.ts`
- [ ] `actionpack/src/action-dispatch/testing/assertions.ts`: wire the XML branch of `htmlDocument()` (`Nokogiri::XML::Document.parse` for XML responses). The HTML branch depends on `rails-dom-testing` and remains deferred (see comment at assertions.ts:9)
- [ ] `activesupport/src/xml-mini/nokogiri-engine.ts` written with `toHash` traversal
- [ ] `activesupport/src/xml-mini/nokogiri-sax-engine.ts` written
- [ ] Tests: DOM parse/traverse/errors + SAX hash parity + CDATA
- [ ] `dispose()` tested (no WASM memory leak on normal usage path)

## Risks / open questions

- **WASM bundle size.** ~400 KB gzipped is heavier than xmldom (~15 KB) or
  htmlparser2 (~30 KB). Acceptable for a server-side Rails-equivalent
  framework; may matter for edge/browser bundles. The real libxml2 fidelity
  justifies the cost.
- **Top-level await.** libxml2-wasm initializes WASM via TLA on import.
  Bundlers that don't support TLA (older webpack configs) need
  configuration. Our lazy init pattern mitigates this — the WASM module
  is only loaded on first parse call, not on package import.
- **`dispose()` discipline.** If a consumer forgets to dispose, WASM memory
  leaks silently. `SaxParser.parse()` handles dispose internally.
  `parseXml()` and `XML.Document.parse()` require the caller to dispose —
  document this prominently and show `try/finally` + `.dispose()` in examples.
- **libxml2-wasm maintenance.** Single maintainer (jameslan). Mitigated by:
  the WASM binary is a compiled artifact of a stable C library (libxml2),
  so even without upstream JS updates the core parser remains correct.
  If the package is abandoned, forking and recompiling libxml2 to WASM is
  a documented, reproducible process.
- **`Document` re-export ergonomics.** The namespace object pattern
  (`XML.Document`) doesn't carry the class through TypeScript's
  `import type` narrowing as cleanly as a direct class export. Concrete
  call sites read fine; flag in code review if a consumer fights it.
