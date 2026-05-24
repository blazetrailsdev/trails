# `@blazetrails/nokogiri` plan

Rails parallel: [nokogiri](https://github.com/sparklemotion/nokogiri) (libxml2
bindings). Scoped to actionpack + activesupport usage only (actiontext deferred).

## Engine choice

- **[@xmldom/xmldom](https://github.com/xmldom/xmldom)** — W3C XML DOM Level 2
  parser + serializer. Zero dependencies. Covers all current XML parsing needs.
- **[htmlparser2](https://github.com/fb55/htmlparser2)** — fast streaming
  parser with SAX-like event API. Used only for the SAX backend
  (`XmlMini_NokogiriSAX`). htmlparser2 supports XML mode via
  `{ xmlMode: true }`.

## Consumers (actionpack + activesupport only)

| Rails consumer                      | What it uses                                  | Engine      |
| ----------------------------------- | --------------------------------------------- | ----------- |
| actionpack `assertions.ts`          | `XML::Document.parse(body)` for XML responses | xmldom      |
| activesupport `XmlMini_Nokogiri`    | `Nokogiri::XML(data)` → DOM → `to_hash`       | xmldom      |
| activesupport `XmlMini_NokogiriSAX` | `SAX::Parser` + `SAX::Document` handler       | htmlparser2 |

## Package layout

```
packages/nokogiri/
  package.json            # name: @blazetrails/nokogiri
  src/
    index.ts              # public re-exports
    xml/
      document.ts         # XML.Document — wraps xmldom DOMParser
      node.ts             # XML.Node — wraps xmldom Node
    sax/
      document.ts         # SAX.Document — handler base class
      parser.ts           # SAX.Parser — wraps htmlparser2 streaming
    parse-xml.ts          # parseXml() convenience function
    *.test.ts
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

### XML.Document

Wraps xmldom's `DOMParser().parseFromString(data, 'text/xml')`.

```ts
class Document {
  static parse(data: string): Document;
  root: Node;
  errors: Error[];
}
```

Rails usage:

```ruby
# actionpack — assertions.rb:19
Nokogiri::XML::Document.parse(@response.body)

# activesupport — xml_mini/nokogiri.rb:27-28
doc = Nokogiri::XML(data)
raise doc.errors.first if doc.errors.length > 0
doc.to_hash   # via monkeypatch — calls doc.root.to_hash
```

### XML.Node

Thin wrapper over xmldom's Node. Only the methods Rails actually calls:

```ts
class Node {
  // Identity
  name: string; // tag name

  // Predicates
  isElement(): boolean; // Rails: element?
  isText(): boolean; // Rails: text?
  isCdata(): boolean; // Rails: cdata?

  // Content
  content: string; // text content of node

  // Traversal
  children: Node[]; // iterable child nodes

  // Attributes
  attributeNodes: AttrNode[]; // each has .nodeName: string, .value: string
}
```

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

Base class — consumer overrides callbacks:

```ts
class SaxDocument {
  startDocument(): void;
  endDocument(): void;
  startElement(name: string, attrs: [string, string][]): void;
  endElement(name: string): void;
  characters(string: string): void;
  cdataBlock(string: string): void;
  error(message: string): void;
}
```

### SAX.Parser

Wraps htmlparser2's streaming parser in XML mode:

```ts
class SaxParser {
  constructor(handler: SaxDocument);
  parse(data: string): void;
}
```

Rails usage (`xml_mini/nokogirisax.rb`):

```ruby
parser = Nokogiri::XML::SAX::Parser.new(document)
parser.parse(data)
```

## Dependencies

- Runtime: `@xmldom/xmldom` (^0.9), `htmlparser2` (^10)
- Dev: workspace vitest

## Implementation sequence

### PR 1 — XML DOM (~200 LOC)

- `XML.Document`: wraps xmldom `DOMParser().parseFromString(data, 'text/xml')`
  with `.parse()` static, `.root`, `.errors`
- `XML.Node`: wrapper exposing `name`, `isElement()`, `isText()`, `isCdata()`,
  `content`, `children`, `attributeNodes`
- `parseXml(data)` convenience function (mirrors `Nokogiri::XML(data)`)
- Tests: parse XML → traverse → read attributes → verify errors on malformed

### PR 2 — SAX (~150 LOC)

- `SAX.Document` base class with overridable callbacks
- `SAX.Parser` wrapping htmlparser2's `Parser` with `{ xmlMode: true }`
- Tests: streaming parse producing same hash as DOM parse (mirror the
  `XmlMini_NokogiriSAX` `HashBuilder` pattern)

## Integration points

Once this package exists:

- **activesupport** `xml_mini/nokogiri.ts` imports `XML.Document` / `parseXml`
- **activesupport** `xml_mini/nokogirisax.ts` imports `SAX.Parser` / `SAX.Document`
- **actionpack** `assertions.ts` `htmlDocument()` uses `XML.Document.parse()`
  for XML responses

## Future expansion (actiontext)

When actiontext is in scope, this package will need:

- HTML parsing (htmlparser2 DOM mode or separate HTML document class)
- `.css()` selector support (css-select)
- Node mutation (`.replace()`, `.innerHtml`, `.remove()`, `.dup()`)
- Element/attribute bracket access, `.createElement()`, `.fragment()`
- `SaveOptions.AS_HTML` serialization flag

These are explicitly deferred — the package structure accommodates adding
`html/` and expanding the Node interface later without breaking the XML API.

## Non-goals (v1)

- HTML parsing (deferred to actiontext work)
- CSS selectors (deferred)
- XPath
- XSLT
- Encoding detection beyond UTF-8
- Full W3C DOM compliance — only implement what Rails calls
