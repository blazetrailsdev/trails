import { describe, it } from "vitest";

describe("HashToXmlTest", () => {
  it.skip("one level");
  it.skip("one level dasherize false");
  it.skip("one level dasherize true");
  it.skip("one level camelize true");
  it.skip("one level camelize lower");
  it.skip("one level with types");
  it.skip("one level with nils");
  it.skip("one level with skipping types");
  it.skip("one level with yielding");
  it.skip("two levels");
  it.skip("two levels with second level overriding to xml");
  it.skip("two levels with array");
  it.skip("three levels with array");
  it.skip(
    "multiple records from xml with attributes other than type ignores them without exploding",
  );
  it.skip("single record from xml");
  it.skip("single record from xml with nil values");
  it.skip("multiple records from xml");
  it.skip("single record from xml with attributes other than type");
  it.skip("all caps key from xml");
  it.skip("empty array from xml");
  it.skip("empty array with whitespace from xml");
  it.skip("array with one entry from xml");
  it.skip("array with multiple entries from xml");
  it.skip("file from xml");
  it.skip("file from xml with defaults");
  it.skip("tag with attrs and whitespace");
  it.skip("empty cdata from xml");
  it.skip("xsd like types from xml");
  it.skip("type trickles through when unknown");
  it.skip("from xml raises on disallowed type attributes");
  it.skip("from xml disallows symbol and yaml types by default");
  it.skip("from xml array one");
  it.skip("from xml array many");
  it.skip("from trusted xml allows symbol and yaml types");
  it.skip("kernel method names to xml");
  it.skip("empty string works for typecast xml value");
  it.skip("escaping to xml");
  it.skip("unescaping from xml");
  it.skip("roundtrip to xml from xml");
  it.skip("datetime xml type with utc time");
  it.skip("datetime xml type with non utc time");
  it.skip("datetime xml type with far future date");
  it.skip("expansion count is limited");
});

describe("ToXmlTest", () => {
  it.skip("to xml dups options");
});

describe("ParsingTest", () => {
  it.skip("symbol");
  it.skip("date");
  it.skip("datetime");
  it.skip("duration");
  it.skip("integer");
  it.skip("float");
  it.skip("decimal");
  it.skip("boolean");
  it.skip("string");
  it.skip("yaml");
  it.skip("hexBinary");
  it.skip("base64Binary and binary");
});
