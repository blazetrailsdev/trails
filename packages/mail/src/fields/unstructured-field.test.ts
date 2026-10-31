/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it } from "vitest";
import { SubjectField } from "./subject-field.js";
import { UnstructuredField } from "./unstructured-field.js";

let field: any;

describe("Mail::UnstructuredField", () => {
  describe("initialization", () => {
    it("should be instantiated", () => {
      expect(() => new UnstructuredField("Name", "Value")).not.toThrow();
    });
  });
  describe("manipulation", () => {
    beforeEach(() => {
      field = new UnstructuredField("Subject", "Hello Frank");
    });
    it("should allow us to set a text value at initialization", () => {
      expect(() => new UnstructuredField("Subject", "Value")).not.toThrow();
    });
    it("should provide access to the text of the field once set", () => {
      expect(field.value).toEqual("Hello Frank");
    });
    it("should provide a means to change the value", () => {
      field.value = "Goodbye Frank";
      expect(field.value).toEqual("Goodbye Frank");
    });
  });
  describe("displaying encoded field and decoded value", () => {
    beforeEach(() => {
      field = new UnstructuredField("Subject", "Hello Frank");
    });
    it("should provide a to_s function that returns the field name and value", () => {
      expect(field.value).toEqual("Hello Frank");
    });
    it("should return '' on to_s if there is no value", () => {
      field.value = null;
      expect(field.toString()).toEqual("");
    });
    it("should give an encoded value ready to insert into an email", () => {
      expect(field.encoded()).toEqual("Subject: Hello Frank\r\n");
    });
    it("should return nil on encoded if it has no value", () => {
      field.value = null;
      expect(field.encoded()).toEqual("");
    });
    it("should handle array", () => {
      field = new UnstructuredField("To", ["mikel@example.com", "bob@example.com"]);
      expect(field.encoded()).toEqual("To: mikel@example.com, bob@example.com\r\n");
    });
    it("should handle string", () => {
      field.value = "test";
      expect(field.encoded()).toEqual("Subject: test\r\n");
    });
    it("should give an decoded value ready to insert into an email", () => {
      expect(field.decoded()).toEqual("Hello Frank");
    });
    it("should return a nil on decoded if it has no value", () => {
      field.value = null;
      expect(field.decoded()).toBeNull();
    });
    it("should just add the CRLF at the end of the line", () => {
      field = new SubjectField("=?utf-8?Q?testing_testing_=D6=A4?=");
      const result = "Subject: =?UTF-8?Q?testing_testing_=D6=A4?=\r\n";
      expect(field.encoded()).toEqual(result);
      expect(field.decoded()).toEqual("testing testing \u05a4");
    });
    it("should do encoded-words encoding correctly without extra equal sign", () => {
      field = new SubjectField("testing testing æøå");
      const result = "Subject: =?UTF-8?Q?testing_testing_=C3=A6=C3=B8=C3=A5?=\r\n";
      expect(field.encoded()).toEqual(result);
      expect(field.decoded()).toEqual("testing testing æøå");
    });
    it("should encode the space between two adjacent encoded-words", () => {
      field = new SubjectField("Her er æ ø å");
      const result = "Subject: =?UTF-8?Q?Her_er_=C3=A6_=C3=B8_=C3=A5?=\r\n";
      expect(field.encoded()).toEqual(result);
      expect(field.decoded()).toEqual("Her er æ ø å");
    });
    it("should encode additional special characters inside encoded-word-encoded strings", () => {
      const string = 'Her er æ()<>@,;:\\"/[]?.=';
      field = new SubjectField(string);
      const result = "Subject: =?UTF-8?Q?Her_er_=C3=A6=28=29<>@,;:\\=22/[]=3F.=3D?=\r\n";
      expect(field.encoded()).toEqual(result);
      expect(field.decoded()).toEqual(string);
    });
    it("should decode a utf-7(B) encoded unstructured field", () => {
      const string = "=?UTF-7?B?JkFPUS0mLSZBT1EtJi0mQU9RLQ==?=";
      field = new UnstructuredField("References", string);
      expect(field.decoded()).toEqual("ä&ä&ä");
    });
  });
  describe("folding", () => {
    it("should not fold itself if it is 78 chracters long", () => {
      field = new UnstructuredField(
        "Subject",
        "This is a subject header message that is _exactly_ 78 characters....",
      );
      expect(field.encoded()).toEqual(
        "Subject: This is a subject header message that is _exactly_ 78 characters....\r\n",
      );
    });
    it("should fold itself if it is 79 chracters long", () => {
      field = new UnstructuredField(
        "Subject",
        "This is a subject header message that is absolutely 79 characters long",
      );
      const result =
        "Subject: This is a subject header message that is absolutely 79 characters\r\n long\r\n";
      expect(field.encoded()).toEqual(result);
    });
    it("should fold itself if it is non us-ascii", () => {
      const string =
        "This is あ really long string This is あ really long string This is あ really long string This is あ really long string This is あ really long string";
      field = new UnstructuredField("Subject", string);
      const result =
        "Subject: =?UTF-8?Q?This_is_=E3=81=82_really_long_string_This_is_=E3=81=82?=\r\n =?UTF-8?Q?_really_long_string_This_is_=E3=81=82_really_long_string_This_is?=\r\n =?UTF-8?Q?_=E3=81=82_really_long_string_This_is_=E3=81=82_really_long?=\r\n =?UTF-8?Q?_string?=\r\n";
      expect(field.encoded()).toEqual(result);
      expect(field.decoded()).toEqual(string);
    });
    it("should fold properly with my actual complicated header", () => {
      const string =
        '{"unique_args": {"mailing_id":147,"account_id":2}, "to": ["larspind@gmail.com"], "category": "mailing", "filters": {"domainkeys": {"settings": {"domain":1,"enable":1}}}, "sub": {"{{open_image_url}}": ["http://betaling.larspind.local/O/token/147/Mailing::FakeRecipient"], "{{name}}": ["[FIRST NAME]"], "{{signup_reminder}}": ["(her kommer til at stå hvornår folk har skrevet sig op ...)"], "{{unsubscribe_url}}": ["http://betaling.larspind.local/U/token/147/Mailing::FakeRecipient"], "{{email}}": ["larspind@gmail.com"], "{{link:308}}": ["http://betaling.larspind.local/L/308/0/Mailing::FakeRecipient"], "{{confirm_url}}": [""], "{{ref}}": ["[REF]"]}}';
      field = new UnstructuredField("X-SMTPAPI", string);
      const result =
        "X-SMTPAPI: =?UTF-8?Q?{=22unique=5Fargs=22:_{=22mailing=5Fid=22:147,=22a?=\r\n =?UTF-8?Q?ccount=5Fid=22:2},_=22to=22:_[=22larspind@gmail.com=22],_=22categ?=\r\n =?UTF-8?Q?ory=22:_=22mailing=22,_=22filters=22:_{=22domainkeys=22:_{=22sett?=\r\n =?UTF-8?Q?ings=22:_{=22domain=22:1,=22enable=22:1}}},_=22sub=22:_{=22{{op?=\r\n =?UTF-8?Q?en=5Fimage=5Furl}}=22:_[=22http://betaling.larspind.local/O?=\r\n =?UTF-8?Q?/token/147/Mailing::FakeRecipient=22],_=22{{name}}=22:_[=22[FIRST?=\r\n =?UTF-8?Q?_NAME]=22],_=22{{signup=5Freminder}}=22:_[=22=28her_kommer_til_at?=\r\n =?UTF-8?Q?_st=C3=A5_hvorn=C3=A5r_folk_har_skrevet_sig_op_...=29=22],?=\r\n =?UTF-8?Q?_=22{{unsubscribe=5Furl}}=22:_[=22http://betaling.larspind.?=\r\n =?UTF-8?Q?local/U/token/147/Mailing::FakeRecipient=22],_=22{{email}}=22:?=\r\n =?UTF-8?Q?_[=22larspind@gmail.com=22],_=22{{link:308}}=22:_[=22http://beta?=\r\n =?UTF-8?Q?ling.larspind.local/L/308/0/Mailing::FakeRecipient=22],_=22{{con?=\r\n =?UTF-8?Q?firm=5Furl}}=22:_[=22=22],_=22{{ref}}=22:_[=22[REF]=22]}}?=\r\n";
      expect(field.encoded()).toEqual(result);
      expect(field.decoded()).toEqual(string);
    });
    it("should fold properly with continuous spaces around the linebreak", () => {
      field = new UnstructuredField(
        "Subject",
        "This is a header that has continuous spaces around line break point,     which should be folded properly",
      );
      const result =
        "Subject: This is a header that has continuous spaces around line break point, \r\n    which should be folded properly\r\n";
      expect(field.encoded()).toEqual(result);
    });
  });
  describe("encoding non QP safe chars", () => {
    it("should encode an ascii string that has carriage returns if asked to", () => {
      const result = "Subject: =0Aasdf=0A\r\n";
      field = new UnstructuredField("Subject", "\nasdf\n");
      expect(field.encoded()).toEqual(result);
    });
  });
});
