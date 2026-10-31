import { describe, expect, it } from "vitest";
import { SubjectField } from "./subject-field.js";
import { UnstructuredField } from "./unstructured-field.js";

describe("Mail::UnstructuredField", () => {
  describe("displaying encoded field and decoded value", () => {
    it("should handle array", () => {
      const field = new UnstructuredField("To", ["mikel@example.com", "bob@example.com"]);
      expect(field.encoded()).toBe("To: mikel@example.com, bob@example.com\r\n");
    });

    it("should encode additional special characters inside encoded-word-encoded strings", () => {
      const string = 'Her er æ()<>@,;:\\"/[]?.=';
      const field = new SubjectField(string);
      const result = "Subject: =?UTF-8?Q?Her_er_=C3=A6=28=29<>@,;:\\=22/[]=3F.=3D?=\r\n";
      expect(field.encoded()).toBe(result);
      expect(field.decoded()).toBe(string);
    });
  });

  describe("folding", () => {
    it("should fold itself if it is 79 chracters long", () => {
      const field = new UnstructuredField(
        "Subject",
        "This is a subject header message that is absolutely 79 characters long",
      );
      const result =
        "Subject: This is a subject header message that is absolutely 79 characters\r\n long\r\n";
      expect(field.encoded()).toBe(result);
    });

    it("should fold itself if it is non us-ascii", () => {
      const string =
        "This is あ really long string This is あ really long string This is あ really long string This is あ really long string This is あ really long string";
      const field = new UnstructuredField("Subject", string);
      const result =
        "Subject: =?UTF-8?Q?This_is_=E3=81=82_really_long_string_This_is_=E3=81=82?=\r\n =?UTF-8?Q?_really_long_string_This_is_=E3=81=82_really_long_string_This_is?=\r\n =?UTF-8?Q?_=E3=81=82_really_long_string_This_is_=E3=81=82_really_long?=\r\n =?UTF-8?Q?_string?=\r\n";
      expect(field.encoded()).toBe(result);
      expect(field.decoded()).toBe(string);
    });
  });

  describe("encoding non QP safe chars", () => {
    it("should encode an ascii string that has carriage returns if asked to", () => {
      const field = new UnstructuredField("Subject", "\nasdf\n");
      expect(field.encoded()).toBe("Subject: =0Aasdf=0A\r\n");
    });
  });
});
