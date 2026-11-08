import { describe, expect, it } from "vitest";
import { Mail } from "../../lib/mail.js";
import { ContentTypeField } from "../../lib/fields/content-type-field.js";

const params = (c: ContentTypeField) => Object.fromEntries(c.parameters().entries());

describe("Mail::ContentTypeField", () => {
  describe("initialization", () => {
    it("should initialize", () => {
      expect(() => new ContentTypeField("<1234@test.lindsaar.net>")).not.toThrow();
    });

    it("should accept a string without the field name", () => {
      const c = new ContentTypeField("text/plain");
      expect(c.name).toEqual("Content-Type");
      expect(c.value).toEqual("text/plain");
    });

    it("should accept a nil value and generate a content_type", () => {
      const c = new ContentTypeField("Content-Type", null);
      expect(c.name).toEqual("Content-Type");
      expect(c.value).not.toBeNull();
    });

    it("should render encoded", () => {
      const c = new ContentTypeField("text/plain");
      expect(c.encoded()).toEqual("Content-Type: text/plain\r\n");
    });

    it("should render encoded with parameters", () => {
      const c = new ContentTypeField("text/plain; charset=US-ASCII; format=flowed");
      expect(c.encoded()).toEqual(
        "Content-Type: text/plain;\r\n charset=US-ASCII;\r\n format=flowed\r\n",
      );
    });

    it("should render quoted values encoded", () => {
      const c = new ContentTypeField('text/plain; example="foo bar"');
      expect(c.encoded()).toEqual('Content-Type: text/plain;\r\n example="foo bar"\r\n');
    });

    it("should render decoded", () => {
      const c = new ContentTypeField("text/plain; charset=US-ASCII; format=flowed");
      expect(c.decoded()).toEqual("text/plain; charset=US-ASCII; format=flowed");
    });

    it("should render quoted values decoded", () => {
      const c = new ContentTypeField('text/plain; example="foo bar"');
      expect(c.decoded()).toEqual('text/plain; example="foo bar"');
    });

    it("should render ", () => {
      const c = new ContentTypeField("message/delivery-status");
      expect(c.mainType()).toEqual("message");
      expect(c.subType()).toEqual("delivery-status");
    });

    it("should wrap a filename in double quotation marks only if the filename contains spaces and does not already have double quotation marks", () => {
      let c = new ContentTypeField("text/plain; name=This is a bad filename.txt");
      expect(c.value).toEqual('text/plain; name="This is a bad filename.txt"');

      c = new ContentTypeField("image/jpg; name=some.jpg; size=100");
      expect(c.value).toEqual("image/jpg; name=some.jpg; size=100");

      c = new ContentTypeField(
        'text/plain; name="Bad filename but at least it is wrapped in quotes.txt"',
      );
      expect(c.value).toEqual(
        'text/plain; name="Bad filename but at least it is wrapped in quotes.txt"',
      );
    });

    it("should only wrap filenames in double quotation marks", () => {
      const c = new ContentTypeField("image/jpg;\r\n name=some .jpg\r\n size=100");
      expect(c.value).toEqual('image/jpg;\r\n name="some .jpg"\r\n size=100');
    });
  });

  describe("instance methods", () => {
    it("should return a content_type", () => {
      const c = new ContentTypeField("text/plain");
      expect(c.contentType()).toEqual("text/plain");
    });

    it("should return a content_type for the :string method", () => {
      const c = new ContentTypeField("text/plain");
      expect(c.string()).toEqual("text/plain");
    });

    it("should return a main_type", () => {
      const c = new ContentTypeField("text/plain");
      expect(c.mainType()).toEqual("text");
    });

    it("should return a sub_type", () => {
      const c = new ContentTypeField("text/plain");
      expect(c.mainType()).toEqual("text");
    });

    it("should return a parameter as a hash", () => {
      const c = new ContentTypeField("text/plain; charset=US-ASCII");
      expect(params(c)).toEqual({ charset: "US-ASCII" });
    });

    it("should return multiple parameters as a hash", () => {
      const c = new ContentTypeField("text/plain; charset=US-ASCII; format=flowed");
      expect(params(c)).toEqual({ charset: "US-ASCII", format: "flowed" });
    });

    it("should return boundry parameters", () => {
      const c = new ContentTypeField("multipart/mixed; boundary=Apple-Mail-13-196941151");
      expect(params(c)).toEqual({ boundary: "Apple-Mail-13-196941151" });
    });

    it("should be indifferent with the access", () => {
      const c = new ContentTypeField("multipart/mixed; boundary=Apple");
      expect(c.parameters().get("boundary")).toEqual("Apple");
      expect(c.parameters().get("boundary")).toEqual("Apple");
    });
  });

  describe("class methods", () => {
    // PERMANENT-SKIP: red under MRI 3.3 too, `Mail.something_random` (vendor/mail/2.8.1/lib/mail/mail.rb:252-254) seeds `Mail.uniq` negative, so the boundary holds a "-".
    it.skip("should give back an initialized instance with a unique boundary", () => {
      const boundary = ContentTypeField.withBoundary("multipart/mixed");
      expect(boundary.encoded()).toMatch(
        /Content-Type: multipart\/mixed;\r\n boundary="--==_mimepart_[\w]+_[\w]+"\r\n/,
      );
    });

    // PERMANENT-SKIP: red under MRI 3.3 too, `Mail.something_random` (vendor/mail/2.8.1/lib/mail/mail.rb:252-254) seeds `Mail.uniq` negative, so the boundary holds a "-".
    it.skip("should give back an initialized instance with different type with a unique boundary", () => {
      const boundary = ContentTypeField.withBoundary("multipart/alternative");
      expect(boundary.encoded()).toMatch(
        /Content-Type: multipart\/alternative;\r\n boundary="--==_mimepart_[\w]+_[\w]+"\r\n/,
      );
    });

    it("should give unique boundaries", () => {
      const boundary1 = ContentTypeField.withBoundary("multipart/alternative")
        .parameters()
        .get("boundary");
      for (let i = 0; i <= 250; i++) {
        const boundary2 = ContentTypeField.withBoundary("multipart/alternative")
          .parameters()
          .get("boundary");
        expect(boundary1).not.toEqual(boundary2);
      }
    });
  });

  describe("Testing a bunch of email Content-Type fields", () => {
    it("should handle 'application/octet-stream; name*=iso-2022-jp'ja'01%20Quien%20Te%20Dij%8aat.%20Pitbull.mp3'", () => {
      const string =
        "application/octet-stream; name*=iso-2022-jp'ja'01%20Quien%20Te%20Dij%8aat.%20Pitbull.mp3";
      const c = new ContentTypeField(string);
      expect(c.contentType()).toEqual("application/octet-stream");
      expect(c.mainType()).toEqual("application");
      expect(c.subType()).toEqual("octet-stream");
      expect(params(c)).toEqual({
        "name*": "iso-2022-jp'ja'01%20Quien%20Te%20Dij%8aat.%20Pitbull.mp3",
      });
    });
    it("should handle 'application/pdf;'", () => {
      const string = "application/pdf;";
      const c = new ContentTypeField(string);
      expect(c.contentType()).toEqual("application/pdf");
      expect(c.mainType()).toEqual("application");
      expect(c.subType()).toEqual("pdf");
      expect(params(c)).toEqual({});
    });
    it("should handle 'application/pdf; name=\\\"broken.pdf\\\"'", () => {
      const string = 'application/pdf; name="broken.pdf"';
      const c = new ContentTypeField(string);
      expect(c.contentType()).toEqual("application/pdf");
      expect(c.mainType()).toEqual("application");
      expect(c.subType()).toEqual("pdf");
      expect(params(c)).toEqual({ name: "broken.pdf" });
    });
    it("should handle 'application/pkcs7-signature;'", () => {
      const string = "application/pkcs7-signature;";
      const c = new ContentTypeField(string);
      expect(c.contentType()).toEqual("application/pkcs7-signature");
      expect(c.mainType()).toEqual("application");
      expect(c.subType()).toEqual("pkcs7-signature");
      expect(params(c)).toEqual({});
    });
    it("should handle 'application/pkcs7-signature; name=smime.p7s'", () => {
      const string = "application/pkcs7-signature; name=smime.p7s";
      const c = new ContentTypeField(string);
      expect(c.contentType()).toEqual("application/pkcs7-signature");
      expect(c.mainType()).toEqual("application");
      expect(c.subType()).toEqual("pkcs7-signature");
      expect(params(c)).toEqual({ name: "smime.p7s" });
    });
    it("should handle 'application/x-gzip; NAME=blah.gz'", () => {
      const string = "application/x-gzip; NAME=blah.gz";
      const c = new ContentTypeField(string);
      expect(c.contentType()).toEqual("application/x-gzip");
      expect(c.mainType()).toEqual("application");
      expect(c.subType()).toEqual("x-gzip");
      expect(params(c)).toEqual({ NAME: "blah.gz" });
    });
    it("should handle 'image/jpeg'", () => {
      const string = "image/jpeg";
      const c = new ContentTypeField(string);
      expect(c.contentType()).toEqual("image/jpeg");
      expect(c.mainType()).toEqual("image");
      expect(c.subType()).toEqual("jpeg");
      expect(params(c)).toEqual({});
    });
    it("should handle 'image/jpeg'", () => {
      const string = "image/jpeg";
      const c = new ContentTypeField(string);
      expect(c.contentType()).toEqual("image/jpeg");
      expect(c.mainType()).toEqual("image");
      expect(c.subType()).toEqual("jpeg");
      expect(params(c)).toEqual({});
    });
    it("should handle 'image/jpeg;'", () => {
      const string = "image/jpeg";
      const c = new ContentTypeField(string);
      expect(c.contentType()).toEqual("image/jpeg");
      expect(c.mainType()).toEqual("image");
      expect(c.subType()).toEqual("jpeg");
      expect(params(c)).toEqual({});
    });
    it("should handle 'image/png;'", () => {
      const string = "image/png";
      const c = new ContentTypeField(string);
      expect(c.contentType()).toEqual("image/png");
      expect(c.mainType()).toEqual("image");
      expect(c.subType()).toEqual("png");
      expect(params(c)).toEqual({});
    });
    it("should handle 'message/delivery-status'", () => {
      const string = "message/delivery-status";
      const c = new ContentTypeField(string);
      expect(c.contentType()).toEqual("message/delivery-status");
      expect(c.mainType()).toEqual("message");
      expect(c.subType()).toEqual("delivery-status");
      expect(params(c)).toEqual({});
    });
    it("should handle 'message/rfc822'", () => {
      const string = "message/rfc822";
      const c = new ContentTypeField(string);
      expect(c.contentType()).toEqual("message/rfc822");
      expect(c.mainType()).toEqual("message");
      expect(c.subType()).toEqual("rfc822");
      expect(params(c)).toEqual({});
    });
    it("should handle 'multipart/alternative;'", () => {
      const string = "multipart/alternative;";
      const c = new ContentTypeField(string);
      expect(c.contentType()).toEqual("multipart/alternative");
      expect(c.mainType()).toEqual("multipart");
      expect(c.subType()).toEqual("alternative");
      expect(params(c)).toEqual({});
    });
    it("should handle 'multipart/alternative; boundary=\\\"----=_NextPart_000_0093_01C81419.EB75E850\\\"'", () => {
      const string = 'multipart/alternative; boundary="----=_NextPart_000_0093_01C81419.EB75E850"';
      const c = new ContentTypeField(string);
      expect(c.contentType()).toEqual("multipart/alternative");
      expect(c.mainType()).toEqual("multipart");
      expect(c.subType()).toEqual("alternative");
      expect(params(c)).toEqual({ boundary: "----=_NextPart_000_0093_01C81419.EB75E850" });
    });
    it("should handle 'multipart/alternative; boundary=----=_NextPart_000_0093_01C81419.EB75E850'", () => {
      const string = 'multipart/alternative; boundary="----=_NextPart_000_0093_01C81419.EB75E850"';
      const c = new ContentTypeField(string);
      expect(c.contentType()).toEqual("multipart/alternative");
      expect(c.mainType()).toEqual("multipart");
      expect(c.subType()).toEqual("alternative");
      expect(params(c)).toEqual({ boundary: "----=_NextPart_000_0093_01C81419.EB75E850" });
    });
    it("should handle 'Multipart/Alternative;boundary=MuLtIpArT_BoUnDaRy'", () => {
      const string = "Multipart/Alternative; boundary=MuLtIpArT_BoUnDaRy";
      const c = new ContentTypeField(string);
      expect(c.contentType()).toEqual("multipart/alternative");
      expect(c.mainType()).toEqual("multipart");
      expect(c.subType()).toEqual("alternative");
      expect(params(c)).toEqual({ boundary: "MuLtIpArT_BoUnDaRy" });
    });
    it("should handle 'Multipart/Alternative;boundary=MuLtIpArT_BoUnDaRy'", () => {
      const string = "Multipart/Alternative;boundary=MuLtIpArT_BoUnDaRy";
      const c = new ContentTypeField(string);
      expect(c.contentType()).toEqual("multipart/alternative");
      expect(c.mainType()).toEqual("multipart");
      expect(c.subType()).toEqual("alternative");
      expect(params(c)).toEqual({ boundary: "MuLtIpArT_BoUnDaRy" });
    });
    it(`should handle 'multipart/alternative; boundary="----jkhkjgyurlkmn789809";; charset="us-ascii"'`, () => {
      const string = `multipart/alternative; boundary="----jkhkjgyurlkmn789809";; charset="us-ascii"`;
      const c = new ContentTypeField(string);
      expect(c.contentType()).toEqual("multipart/alternative");
      expect(c.parameters().get("boundary")).toEqual("----jkhkjgyurlkmn789809");
    });
    it("should handle 'multipart/mixed'", () => {
      const string = "multipart/mixed";
      const c = new ContentTypeField(string);
      expect(c.contentType()).toEqual("multipart/mixed");
      expect(c.mainType()).toEqual("multipart");
      expect(c.subType()).toEqual("mixed");
      expect(params(c)).toEqual({});
    });
    it("should handle 'multipart/mixed;'", () => {
      const string = "multipart/mixed;";
      const c = new ContentTypeField(string);
      expect(c.contentType()).toEqual("multipart/mixed");
      expect(c.mainType()).toEqual("multipart");
      expect(c.subType()).toEqual("mixed");
      expect(params(c)).toEqual({});
    });
    it("should handle 'multipart/mixed; boundary=Apple-Mail-13-196941151'", () => {
      const string = "multipart/mixed; boundary=Apple-Mail-13-196941151";
      const c = new ContentTypeField(string);
      expect(c.contentType()).toEqual("multipart/mixed");
      expect(c.mainType()).toEqual("multipart");
      expect(c.subType()).toEqual("mixed");
      expect(params(c)).toEqual({ boundary: "Apple-Mail-13-196941151" });
    });
    it("should handle 'multipart/mixed; boundary=mimepart_427e4cb4ca329_133ae40413c81ef'", () => {
      const string = "multipart/mixed; boundary=mimepart_427e4cb4ca329_133ae40413c81ef";
      const c = new ContentTypeField(string);
      expect(c.contentType()).toEqual("multipart/mixed");
      expect(c.mainType()).toEqual("multipart");
      expect(c.subType()).toEqual("mixed");
      expect(params(c)).toEqual({ boundary: "mimepart_427e4cb4ca329_133ae40413c81ef" });
    });
    it("should handle 'multipart/report; report-type=delivery-status;'", () => {
      const string = "multipart/report; report-type=delivery-status;";
      const c = new ContentTypeField(string);
      expect(c.contentType()).toEqual("multipart/report");
      expect(c.mainType()).toEqual("multipart");
      expect(c.subType()).toEqual("report");
      expect(params(c)).toEqual({ "report-type": "delivery-status" });
    });
    it("should handle 'multipart/signed;'", () => {
      const string = "multipart/signed;";
      const c = new ContentTypeField(string);
      expect(c.contentType()).toEqual("multipart/signed");
      expect(c.mainType()).toEqual("multipart");
      expect(c.subType()).toEqual("signed");
      expect(params(c)).toEqual({});
    });
    it("should handle 'text/enriched;'", () => {
      const string = "text/enriched;";
      const c = new ContentTypeField(string);
      expect(c.contentType()).toEqual("text/enriched");
      expect(c.mainType()).toEqual("text");
      expect(c.subType()).toEqual("enriched");
      expect(params(c)).toEqual({});
    });
    it("should handle 'text/html;'", () => {
      const string = "text/html;";
      const c = new ContentTypeField(string);
      expect(c.contentType()).toEqual("text/html");
      expect(c.mainType()).toEqual("text");
      expect(c.subType()).toEqual("html");
      expect(params(c)).toEqual({});
    });
    it("should handle 'text/html; charset=iso-8859-1;'", () => {
      const string = "text/html; charset=iso-8859-1;";
      const c = new ContentTypeField(string);
      expect(c.contentType()).toEqual("text/html");
      expect(c.mainType()).toEqual("text");
      expect(c.subType()).toEqual("html");
      expect(params(c)).toEqual({ charset: "iso-8859-1" });
    });
    it("should handle 'TEXT/PLAIN; charset=ISO-8859-1;'", () => {
      const string = "TEXT/PLAIN; charset=ISO-8859-1;";
      const c = new ContentTypeField(string);
      expect(c.contentType()).toEqual("text/plain");
      expect(c.mainType()).toEqual("text");
      expect(c.subType()).toEqual("plain");
      expect(params(c)).toEqual({ charset: "ISO-8859-1" });
    });
    it("should handle 'text/plain'", () => {
      const string = "text/plain";
      const c = new ContentTypeField(string);
      expect(c.contentType()).toEqual("text/plain");
      expect(c.mainType()).toEqual("text");
      expect(c.subType()).toEqual("plain");
      expect(params(c)).toEqual({});
    });
    it("should handle 'text/plain;'", () => {
      const string = "text/plain;";
      const c = new ContentTypeField(string);
      expect(c.contentType()).toEqual("text/plain");
      expect(c.mainType()).toEqual("text");
      expect(c.subType()).toEqual("plain");
      expect(params(c)).toEqual({});
    });
    it("should handle 'text/plain; charset=ISO-8859-1'", () => {
      const string = "text/plain; charset=ISO-8859-1";
      const c = new ContentTypeField(string);
      expect(c.contentType()).toEqual("text/plain");
      expect(c.mainType()).toEqual("text");
      expect(c.subType()).toEqual("plain");
      expect(params(c)).toEqual({ charset: "ISO-8859-1" });
    });
    it("should handle 'text/plain; charset=ISO-8859-1;'", () => {
      const string = "text/plain; charset=ISO-8859-1; format=flowed";
      const c = new ContentTypeField(string);
      expect(c.contentType()).toEqual("text/plain");
      expect(c.mainType()).toEqual("text");
      expect(c.subType()).toEqual("plain");
      expect(params(c)).toEqual({ charset: "ISO-8859-1", format: "flowed" });
    });
    it("should handle 'text/plain; charset=us-ascii;'", () => {
      const string = "text/plain; charset=us-ascii";
      const c = new ContentTypeField(string);
      expect(c.contentType()).toEqual("text/plain");
      expect(c.mainType()).toEqual("text");
      expect(c.subType()).toEqual("plain");
      expect(params(c)).toEqual({ charset: "us-ascii" });
    });
    it("should handle 'text/plain; charset=US-ASCII; format=flowed'", () => {
      const string = "text/plain; charset=US-ASCII; format=flowed";
      const c = new ContentTypeField(string);
      expect(c.contentType()).toEqual("text/plain");
      expect(c.mainType()).toEqual("text");
      expect(c.subType()).toEqual("plain");
      expect(params(c)).toEqual({ charset: "US-ASCII", format: "flowed" });
    });
    it("should handle 'text/plain; charset=US-ASCII; format=flowed'", () => {
      const string = "text/plain; charset=US-ASCII; format=flowed";
      const c = new ContentTypeField(string);
      expect(c.contentType()).toEqual("text/plain");
      expect(c.mainType()).toEqual("text");
      expect(c.subType()).toEqual("plain");
      expect(params(c)).toEqual({ charset: "US-ASCII", format: "flowed" });
    });
    it("should handle 'text/plain; charset=utf-8'", () => {
      const string = "text/plain; charset=utf-8";
      const c = new ContentTypeField(string);
      expect(c.contentType()).toEqual("text/plain");
      expect(c.mainType()).toEqual("text");
      expect(c.subType()).toEqual("plain");
      expect(params(c)).toEqual({ charset: "utf-8" });
    });
    it("should handle 'text/plain; charset=utf-8'", () => {
      const string = "text/plain; charset=X-UNKNOWN";
      const c = new ContentTypeField(string);
      expect(c.contentType()).toEqual("text/plain");
      expect(c.mainType()).toEqual("text");
      expect(c.subType()).toEqual("plain");
      expect(params(c)).toEqual({ charset: "X-UNKNOWN" });
    });
    it("should handle 'text/x-ruby-script;'", () => {
      const string = "text/x-ruby-script;";
      const c = new ContentTypeField(string);
      expect(c.contentType()).toEqual("text/x-ruby-script");
      expect(c.mainType()).toEqual("text");
      expect(c.subType()).toEqual("x-ruby-script");
      expect(params(c)).toEqual({});
    });
    it("should handle 'text/x-ruby-script; name=\\\"hello.rb\\\"'", () => {
      const string = 'text/x-ruby-script; name="hello.rb"';
      const c = new ContentTypeField(string);
      expect(c.contentType()).toEqual("text/x-ruby-script");
      expect(c.mainType()).toEqual("text");
      expect(c.subType()).toEqual("x-ruby-script");
      expect(params(c)).toEqual({ name: "hello.rb" });
    });
    it('should handle \'multipart/mixed; boundary=\\"=_NextPart_Lycos_15031600484464_ID\\"', () => {
      const string = 'multipart/mixed; boundary="=_NextPart_Lycos_15031600484464_ID"';
      const c = new ContentTypeField(string);
      expect(c.contentType()).toEqual("multipart/mixed");
      expect(c.mainType()).toEqual("multipart");
      expect(c.subType()).toEqual("mixed");
      expect(params(c)).toEqual({ boundary: "=_NextPart_Lycos_15031600484464_ID" });
    });
    it('should handle \'multipart/mixed; boundary=\\"=_NextPart_2rfkindysadvnqw3nerasdf\\";windows-852', () => {
      const string = 'multipart/mixed; boundary="=_NextPart_2rfkindysadvnqw3nerasdf";windows-852';
      const c = new ContentTypeField(string);
      expect(c.contentType()).toEqual("multipart/mixed");
      expect(c.mainType()).toEqual("multipart");
      expect(c.subType()).toEqual("mixed");
      expect(params(c)).toEqual({
        boundary: "=_NextPart_2rfkindysadvnqw3nerasdf",
        "windows-852": "",
      });
    });
    it("should handle 'multipart/alternative; boundary=----=_=NextPart_000_0093_01C81419.EB75E850", () => {
      const string = "multipart/alternative; boundary=----=_=NextPart_000_0093_01C81419.EB75E850";
      const c = new ContentTypeField(string);
      expect(c.contentType()).toEqual("multipart/alternative");
      expect(c.mainType()).toEqual("multipart");
      expect(c.subType()).toEqual("alternative");
      expect(params(c)).toEqual({ boundary: "----=_=NextPart_000_0093_01C81419.EB75E850" });
    });
    it('should handle \'multipart/alternative; boundary=\\"----=_=NextPart_000_0093_01C81419.EB75E850\\"', () => {
      const string = 'multipart/alternative; boundary="----=_=NextPart_000_0093_01C81419.EB75E850"';
      const c = new ContentTypeField(string);
      expect(c.contentType()).toEqual("multipart/alternative");
      expect(c.mainType()).toEqual("multipart");
      expect(c.subType()).toEqual("alternative");
      expect(params(c)).toEqual({ boundary: "----=_=NextPart_000_0093_01C81419.EB75E850" });
    });
    it('should handle \'multipart/related;boundary=1_4626B816_9F1690;Type=\\"application/smil\\";Start=\\"<mms.smil.txt>\\"\'', () => {
      const string =
        'multipart/related;boundary=1_4626B816_9F1690;Type="application/smil";Start="<mms.smil.txt>"';
      const c = new ContentTypeField(string);
      expect(c.contentType()).toEqual("multipart/related");
      expect(c.mainType()).toEqual("multipart");
      expect(c.subType()).toEqual("related");
      expect(params(c)).toEqual({
        boundary: "1_4626B816_9F1690",
        Type: "application/smil",
        Start: "<mms.smil.txt>",
      });
    });
    it("should handle 'IMAGE/JPEG; name=\\\"IM 006.jpg\\\"'", () => {
      const string = 'IMAGE/JPEG; name="IM 006.jpg"';
      const c = new ContentTypeField(string);
      expect(c.contentType()).toEqual("image/jpeg");
      expect(c.mainType()).toEqual("image");
      expect(c.subType()).toEqual("jpeg");
      expect(params(c)).toEqual({ name: "IM 006.jpg" });
    });
    it("should handle 'unknown/unknown'", () => {
      const string = "unknown/unknown; charset=iso-8859-1; name=IMSTP19.gif";
      const c = new ContentTypeField(string);
      expect(c.contentType()).toEqual("unknown/unknown");
      expect(c.mainType()).toEqual("unknown");
      expect(c.subType()).toEqual("unknown");
      expect(params(c)).toEqual({ charset: "iso-8859-1", name: "IMSTP19.gif" });
    });
  });

  describe("finding a filename", () => {
    it("should locate a filename if there is a filename", () => {
      const string = "application/octet-stream; filename=mikel.jpg";
      const c = new ContentTypeField(string);
      expect(c.filename()).toEqual("mikel.jpg");
    });

    it("should locate a name if there is no filename", () => {
      const string = "application/octet-stream; name=mikel.jpg";
      const c = new ContentTypeField(string);
      expect(c.filename()).toEqual("mikel.jpg");
    });

    it("should return an empty string when filename or name is empty", () => {
      let string = 'application/octet-stream; filename=""';
      let c = new ContentTypeField(string);
      expect(c.filename()).toEqual("");

      string = 'application/octet-stream; name=""';
      c = new ContentTypeField(string);
      expect(c.filename()).toEqual("");
    });

    it("should locate an encoded name as a filename", () => {
      const string =
        "application/octet-stream; name*=iso-2022-jp'ja'01%20Quien%20Te%20Dijo%20feat.%20Pitbull.mp3";
      const c = new ContentTypeField(string);
      const expected = "01 Quien Te Dijo feat. Pitbull.mp3";
      const result = c.filename();
      expect(expected).toEqual(result);
    });

    // PERMANENT-SKIP: CLAUDE.md, "A String has no encoding tag either" — the filename is `force_encoding('SJIS')`.
    it.skip("should encode a non us-ascii filename", () => {
      Mail.defaults(function () {
        this.paramEncodeLanguage("jp");
      });
      const c = new ContentTypeField("application/octet-stream");
      const string = "01 Quien Te Dij\x91at. Pitbull.mp3";
      const result =
        "Content-Type: application/octet-stream;\r\n filename*=windows-31j'jp'01%20Quien%20Te%20Dij%91%61t.%20Pitbull.mp3\r\n";
      c.methodMissing("filename=", string);
      expect(Object.fromEntries(c.parameters().entries())).toEqual({ filename: string });
      expect(c.encoded()).toEqual(result);
    });
  });

  describe("handling badly formated content-type fields", () => {
    it("should handle missing sub-type on a text content type", () => {
      const c = new ContentTypeField("text");
      expect(c.contentType()).toEqual("text/plain");
    });

    it("should handle missing ; after content-type", () => {
      const c = new ContentTypeField(
        'multipart/mixed boundary="----=_NextPart_000_000F_01C17754.8C3CAF30"',
      );
      expect(c.contentType()).toEqual("multipart/mixed");
      expect(c.parameters().get("boundary")).toEqual("----=_NextPart_000_000F_01C17754.8C3CAF30");
    });
  });

  describe("initializing with an array", () => {
    it("should initialize with an array", () => {
      const c = new ContentTypeField(["text", "html", { charset: "UTF-8" }]);
      expect(c.contentType()).toEqual("text/html");
      expect(c.parameters().get("charset")).toEqual("UTF-8");
    });

    it("should allow many parameters to be passed in", () => {
      const c = new ContentTypeField(["text", "html", { format: "flowed", charset: "utf-8" }]);
      expect(c.contentType()).toEqual("text/html");
      expect(c.parameters().get("charset")).toEqual("utf-8");
      expect(c.parameters().get("format")).toEqual("flowed");
    });
  });

  describe("special case values needing sanity", () => {
    it("should handle 'text/plain;ISO-8559-1'", () => {
      const c = new ContentTypeField("text/plain;ISO-8559-1");
      expect(c.string()).toEqual("text/plain");
      expect(c.parameters().get("charset")).toEqual("iso-8559-1");
    });

    it("should handle 'text/plain; charset = \\\"iso-8859-1\\\"'", () => {
      const c = new ContentTypeField('text/plain; charset = "iso-8859-1"');
      expect(c.string()).toEqual("text/plain");
      expect(c.parameters().get("charset")).toEqual("iso-8859-1");
    });

    it("should handle text; params", () => {
      const c = new ContentTypeField("text; charset=utf-8");
      expect(c.string()).toEqual("text/plain");
      expect(c.parameters().get("charset")).toEqual("utf-8");
    });

    it('should handle text/html; charset="charset="GB2312""', () => {
      const c = new ContentTypeField('text/html; charset="charset="GB2312""');
      expect(c.string()).toEqual("text/html");
      expect(c.parameters().get("charset")).toEqual("gb2312");
    });

    it("should handle application/octet-stream; name=archiveshelp1[1].htm", () => {
      const c = new ContentTypeField("application/octet-stream; name=archiveshelp1[1].htm");
      expect(c.string()).toEqual("application/octet-stream");
      expect(c.parameters().get("name")).toEqual("archiveshelp1[1].htm");
    });

    it('should handle text/plain;; format="flowed"', () => {
      const c = new ContentTypeField('text/plain;; format="flowed"');
      expect(c.string()).toEqual("text/plain");
      expect(c.parameters().get("format")).toEqual("flowed");
    });

    it("set an empty content type to text/plain", () => {
      const c = new ContentTypeField("");
      expect(c.string()).toEqual("text/plain");
    });

    it("should just ignore illegal params like audio/x-midi;\\r\\n\\sname=Part .exe", () => {
      const c = new ContentTypeField("audio/x-midi;\r\n name=Part .exe");
      expect(c.string()).toEqual("audio/x-midi");
      expect(c.parameters().get("name")).toBeNull();
    });

    it("should handle: rfc822; format=flowed; charset=iso-8859-15", () => {
      const c = new ContentTypeField("rfc822; format=flowed; charset=iso-8859-15");
      expect(c.string()).toEqual("text/plain");
      expect(c.parameters().get("format")).toEqual("flowed");
      expect(c.parameters().get("charset")).toEqual("iso-8859-15");
    });

    it("should just get the mime type if all else fails with some real garbage", () => {
      const c = new ContentTypeField(
        "text/html; format=flowed; charset=iso-8859-15  Mime-Version: 1.0",
      );
      expect(c.string()).toEqual("text/html");
    });

    it("shouldn't include separating semicolon in parameter value when sanitizing", () => {
      const c = new ContentTypeField(
        'Multipart/Related;boundary=boundary123?WUT; type="application/xml";',
      );
      expect(c.parameters().get("boundary")).toEqual("boundary123?WUT");
    });
  });
});
