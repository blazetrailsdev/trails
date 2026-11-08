import { describe, expect, it } from "vitest";
import { DateTime, Temporal } from "@blazetrails/date";
import { ReceivedField } from "./received-field.js";

describe("Mail::ReceivedField", () => {
  it("should initialize", () => {
    expect(
      () =>
        new ReceivedField(
          "from localhost (localhost [127.0.0.1]) by xxx.xxxxx.com (Postfix) with ESMTP id 50FD3A96F for <xxxx@xxxx.com>; Tue, 10 May 2005 17:26:50 +0000 (GMT)",
        ),
    ).not.toThrow();
  });
  it("should be able to tell the time", () => {
    expect(
      new ReceivedField(
        "from localhost (localhost [127.0.0.1]) by xxx.xxxxx.com (Postfix) with ESMTP id 50FD3A96F for <xxxx@xxxx.com>; Tue, 10 May 2005 17:26:50 +0000 (GMT)",
      ).dateTime()?.constructor,
    ).toEqual(Temporal.PlainDateTime);
  });
  it("should accept a string without the field name", () => {
    const t = new ReceivedField(
      "from localhost (localhost [127.0.0.1]) by xxx.xxxxx.com (Postfix) with ESMTP id 50FD3A96F for <xxxx@xxxx.com>; Tue, 10 May 2005 17:26:50 +0000 (GMT)",
    );
    expect(t.name).toEqual("Received");
    expect(t.value).toEqual(
      "from localhost (localhost [127.0.0.1]) by xxx.xxxxx.com (Postfix) with ESMTP id 50FD3A96F for <xxxx@xxxx.com>; Tue, 10 May 2005 17:26:50 +0000 (GMT)",
    );
    expect(t.info()).toEqual(
      "from localhost (localhost [127.0.0.1]) by xxx.xxxxx.com (Postfix) with ESMTP id 50FD3A96F for <xxxx@xxxx.com>",
    );
    expect(t.dateTime()!.equals(DateTime.parse("10 May 2005 17:26:50 +0000 (GMT)") as never)).toBe(
      true,
    );
  });
  it("should provide an encoded value", () => {
    const t = new ReceivedField(
      "from localhost (localhost [127.0.0.1]) by xxx.xxxxx.com (Postfix) with ESMTP id 50FD3A96F for <xxxx@xxxx.com>; Tue, 10 May 2005 17:26:50 +0000 (GMT)",
    );
    expect(t.encoded()).toEqual(
      "Received: from localhost (localhost [127.0.0.1]) by xxx.xxxxx.com (Postfix) with ESMTP id 50FD3A96F for <xxxx@xxxx.com>; Tue, 10 May 2005 17:26:50 +0000\r\n",
    );
  });
  it("should provide an encoded value with correct timezone", () => {
    const t = new ReceivedField(
      "from localhost (localhost [127.0.0.1]) by xxx.xxxxx.com (Postfix) with ESMTP id 50FD3A96F for <xxxx@xxxx.com>; Tue, 10 May 2005 17:26:50 -0500 (EST)",
    );
    expect(t.encoded()).toEqual(
      "Received: from localhost (localhost [127.0.0.1]) by xxx.xxxxx.com (Postfix) with ESMTP id 50FD3A96F for <xxxx@xxxx.com>; Tue, 10 May 2005 17:26:50 -0500\r\n",
    );
  });
  it("should provide an decoded value", () => {
    const t = new ReceivedField(
      "from localhost (localhost [127.0.0.1]) by xxx.xxxxx.com (Postfix) with ESMTP id 50FD3A96F for <xxxx@xxxx.com>; Tue, 10 May 2005 17:26:50 +0000 (GMT)",
    );
    expect(t.decoded()).toEqual(
      "from localhost (localhost [127.0.0.1]) by xxx.xxxxx.com (Postfix) with ESMTP id 50FD3A96F for <xxxx@xxxx.com>; Tue, 10 May 2005 17:26:50 +0000",
    );
  });
  it("should handle empty name-value lists with a comment only (qmail style)", () => {
    const t = new ReceivedField("(qmail 24365 invoked by uid 99); 25 Jan 2011 12:31:11 -0000");
    expect(t.info()).toEqual("(qmail 24365 invoked by uid 99)");
  });
  it("should handle a blank value", () => {
    const t = new ReceivedField("");
    expect(t.decoded()).toEqual("");
    expect(t.encoded()).toEqual("Received: \r\n");
  });
  it("should handle invalid date", () => {
    const t = new ReceivedField(
      "mail.example.com (192.168.1.1) by mail.example.com with (esmtp) id (qid)  for <foo@example.com>; Mon, 29 Jul 2013 25:12:46 +0900",
    );
    expect(t.name).toEqual("Received");
    expect(t.value).toEqual(
      "mail.example.com (192.168.1.1) by mail.example.com with (esmtp) id (qid)  for <foo@example.com>; Mon, 29 Jul 2013 25:12:46 +0900",
    );
    expect(t.info()).toEqual(
      "mail.example.com (192.168.1.1) by mail.example.com with (esmtp) id (qid)  for <foo@example.com>",
    );
    expect(t.dateTime()).toEqual(null);
    expect(t.formattedDate()).toEqual(null);
  });
});
