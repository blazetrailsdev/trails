# Usage: ruby scripts/mail-parsers/corpus.rb packages/mail/src/parsers/fixtures/corpus.ts
$LOAD_PATH.unshift File.expand_path("../../vendor/mail/2.8.1/lib", __dir__)
require "json"
require "mail"
require "mail/parsers"

INPUTS = {
  "AddressListsParser" => [
    "Mikel <a@b.com>, \"x y\" <c@d>, grp: e@f, g@h;", "\"a\"@b.com, C <d@e>", "A <a@b> (c), d@e",
    "<@x,@y:a@b>", "bad <<", "café <ü@ex.com>", "", "   ", "undisclosed-recipients:;",
    "\"Lindsaar, Mikel\" <test@lindsaar.net>", "test@lindsaar.net (Mikel Lindsaar)", "a@b;c@d",
  ],
  "ContentDispositionParser" => [
    "attachment; filename=\"a b.txt\"", "inline", "attachment; filename=x; size=3", "", "attachment; =x",
    "INLINE; Filename=\"Q\"", "attachment;",
  ],
  "ContentLocationParser" => ["\"http://x/y\"", "foo", "", "a b"],
  "ContentTransferEncodingParser" => ["base64", "b a d", "", "7BIT", "quoted-printable (c)"],
  "ContentTypeParser" => [
    "text/plain; charset=\"utf-8\"; format=flowed", "multipart/mixed; boundary=abc", "text/plain; =x",
    "text/", "", "TEXT/HTML", "text/plain;", "application/octet-stream; name=\"a;b\"", "x-foo/bar; a=b; c=\"d\"",
  ],
  "DateTimeParser" => ["Mon, 1 Jan 2024 10:00:00 +0000", "garbage!!", nil, "1 Jan 2024 10:00 -0500 (EST)", ""],
  "EnvelopeFromParser" => ["mikel@test.lindsaar.net Mon Aug 17 00:39:21 2009", "<> Mon Aug 17 00:39:21 2009", "", "x"],
  "MessageIdsParser" => ["<a@b> <c@d>", "<1234@local.machine.example>", nil, "", "a@b", "<a@b>,<c@d>"],
  "MimeVersionParser" => ["1.0", "1.0 (comment)", "x", "", "1 . 0"],
  "PhraseListsParser" => ["Hello, World, \"quoted, phrase\"", nil, "", "one", "a,,b"],
  "ReceivedParser" => [
    "from localhost (localhost [127.0.0.1]) by mx.example.com; Mon, 1 Jan 2024 10:00:00 +0000",
    "by x; Tue, 2 Jan 2024 00:00:00 -0000", nil, "garbage", "",
  ],
}

def norm(v)
  case v
  when Struct then v.to_h.to_h { |k, x| [k.to_s.gsub(/_(\w)/) { $1.upcase }, norm(x)] }
  when Array then v.map { |x| norm(x) }
  when Hash then v.transform_values { |x| norm(x) }
  else v
  end
end

rows = INPUTS.flat_map do |parser, inputs|
  inputs.map do |input|
    result =
      begin
        { "struct" => norm(Mail::Parsers.const_get(parser).parse(input)) }
      rescue => e
        { "error" => e.class.name.split("::").last, "message" => e.message }
      end
    { "parser" => parser, "input" => input }.merge(result)
  end
end
File.write(ARGV.fetch(0), "export const corpus = #{JSON.pretty_generate(rows)};\n")
