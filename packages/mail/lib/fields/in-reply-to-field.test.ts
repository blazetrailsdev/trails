import { describe, expect, it } from "vitest";
import { InReplyToField } from "./in-reply-to-field.js";

describe("Mail::InReplyToField", () => {
  describe("initialization", () => {
    it("should initialize", () => {
      expect(() => new InReplyToField("<1234@test.lindsaar.net>")).not.toThrow();
    });
    it("should accept a string without the field name", () => {
      const t = new InReplyToField("<1234@test.lindsaar.net>");
      expect(t.name).toEqual("In-Reply-To");
      expect(t.value).toEqual("<1234@test.lindsaar.net>");
      expect(t.messageId()).toEqual("1234@test.lindsaar.net");
    });
    it("should provide encoded", () => {
      const t = new InReplyToField("<1234@test.lindsaar.net>");
      expect(t.encoded()).toEqual("In-Reply-To: <1234@test.lindsaar.net>\r\n");
    });
    it("should handle many encoded message IDs", () => {
      const t = new InReplyToField("<1234@test.lindsaar.net> <4567@test.lindsaar.net>");
      expect(t.encoded()).toEqual(
        "In-Reply-To: <1234@test.lindsaar.net>\r\n <4567@test.lindsaar.net>\r\n",
      );
    });
    it("should handle an array of message IDs", () => {
      const t = new InReplyToField(["<1234@test.lindsaar.net>", "<4567@test.lindsaar.net>"]);
      expect(t.encoded()).toEqual(
        "In-Reply-To: <1234@test.lindsaar.net>\r\n <4567@test.lindsaar.net>\r\n",
      );
    });
    it("should provide decoded", () => {
      const t = new InReplyToField("<1234@test.lindsaar.net>");
      expect(t.decoded()).toEqual("<1234@test.lindsaar.net>");
    });
    it("should handle many decoded message IDs", () => {
      const t = new InReplyToField("<1234@test.lindsaar.net> <4567@test.lindsaar.net>");
      expect(t.decoded()).toEqual("<1234@test.lindsaar.net> <4567@test.lindsaar.net>");
    });
    it("should handle an empty value", () => {
      const t = new InReplyToField("");
      expect(t.name).toEqual("In-Reply-To");
      expect(t.decoded()).toBeNull();
    });
  });
  describe("handlign multiple message ids", () => {
    it("should handle many message IDs", () => {
      const t = new InReplyToField("<1234@test.lindsaar.net> <4567@test.lindsaar.net>");
      expect(t.name).toEqual("In-Reply-To");
      expect(t.messageIds()).toEqual(["1234@test.lindsaar.net", "4567@test.lindsaar.net"]);
    });
  });
  it("should output lines shorter than 998 chars", () => {
    const k = new InReplyToField(
      "<Kohciuku@apholoVu.com> <foovohPu@Thegahsh.com> <UuseZeow@oocieBie.com> <UchaeKoo@eeJoukie.com> <ieKahque@ieGoochu.com> <aZaXaeva@ungaiGai.com> <sheiraiK@ookaiSha.com> <weijooPi@ahfuRaeh.com> <FiruJeur@weiphohP.com> <cuadoiQu@aiZuuqua.com> <YohGieVe@Reacepae.com> <Ieyechum@ephooGho.com> <uGhievoo@vusaeciM.com> <ouhieTha@leizaeTi.com> <ohgohGhu@jieNgooh.com> <ahNookah@oChiecoo.com> <taeWieTu@iuwiLooZ.com> <Kohraiji@AizohGoa.com> <hiQuaegh@eeluThii.com> <Uunaesoh@UogheeCh.com> <JeQuahMa@Thahchoh.com> <aaxohJoh@ahfaeCho.com> <Pahneehu@eehooChi.com> <angeoKah@Wahsaeme.com> <ietovoaV@muewaeZi.com> <aebiuZur@oteeYaiF.com> <pheiXahw@Muquahba.com> <aNgiaPha@bohliNge.com> <Eikawohf@IevaiQuu.com> <gihaeduZ@Raighiey.com> <Theequoh@hoamaeSa.com> <VeiVooyi@aimuQuoo.com> <ahGoocie@BohpheVi.com> <roivahPa@uPhoghai.com> <gioZohli@Gaochoow.com> <eireLair@phaevieR.com> <TahthaeC@oolaiBei.com> <phuYeika@leiKauPh.com> <BieYenoh@Xaebaalo.com> <xohvaeWa@ahghaeRe.com> <thoQuohV@Ubooheay.com> <pheeWohV@feicaeNg.com>",
    );
    const lines = k.encoded().split("\r\n ");
    lines.forEach((line) => expect(line.length).toBeLessThan(998));
  });
});
