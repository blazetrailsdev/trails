import { describe, expect, it } from "vitest";
import { DateTime } from "@blazetrails/date";
import { Field } from "../field.js";
import { ReceivedElement } from "./received-element.js";

describe("Mail::ReceivedElement", () => {
  it("should raise an error if the input is nil", () => {
    const received = new ReceivedElement(null);
    expect(received.info).toBeNull();
    expect(received.dateTime).toBeNull();
  });

  it("should raise an error if the input is useless", () => {
    const receivedText = '""""""""""""""""';
    expect(() => new ReceivedElement(receivedText)).toThrow(Field.ParseError);
  });

  it("should give back the date time", () => {
    const receivedText =
      "from localhost (localhost [127.0.0.1]) by xxx.xxxxx.com (Postfix) with ESMTP id 50FD3A96F for <xxxx@xxxx.com>; Tue, 10 May 2005 17:26:50 +0000 (GMT)";
    const dateText = "10 May 2005 17:26:50 +0000 (GMT)";
    const rec = new ReceivedElement(receivedText);
    expect(rec.dateTime).toEqual(DateTime.parse(dateText));
  });

  it("should give back the info", () => {
    const receivedText =
      "from localhost (localhost [127.0.0.1]) by xxx.xxxxx.com (Postfix) with ESMTP id 50FD3A96F for <xxxx@xxxx.com>; Tue, 10 May 2005 17:26:50 +0000 (GMT)";
    const infoText =
      "from localhost (localhost [127.0.0.1]) by xxx.xxxxx.com (Postfix) with ESMTP id 50FD3A96F for <xxxx@xxxx.com>";
    const rec = new ReceivedElement(receivedText);
    expect(rec.info).toEqual(infoText);
  });
});
