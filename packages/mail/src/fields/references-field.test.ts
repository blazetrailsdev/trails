import { describe, expect, it } from "vitest";
import { ReferencesField } from "./references-field.js";

describe("Mail::ReferencesField", () => {
  it("should initialize", () => {
    expect(() => new ReferencesField("<1234@test.lindsaar.net>")).not.toThrow();
  });
  it("should accept a string without the field name", () => {
    const t = new ReferencesField("<1234@test.lindsaar.net>");
    expect(t.name).toEqual("References");
    expect(t.value).toEqual("<1234@test.lindsaar.net>");
    expect(t.messageId()).toEqual("1234@test.lindsaar.net");
  });
  it("should accept multiple message ids", () => {
    const t = new ReferencesField("<1234@test.lindsaar.net> <5678@test.lindsaar.net>");
    expect(t.name).toEqual("References");
    expect(t.value).toEqual("<1234@test.lindsaar.net> <5678@test.lindsaar.net>");
    expect(t.messageId()).toEqual("1234@test.lindsaar.net");
    expect(t.messageIds()).toEqual(["1234@test.lindsaar.net", "5678@test.lindsaar.net"]);
    expect(t.toString()).toEqual("<1234@test.lindsaar.net> <5678@test.lindsaar.net>");
  });
  it("should accept an array of message ids", () => {
    const t = new ReferencesField(["<1234@test.lindsaar.net>", "<5678@test.lindsaar.net>"]);
    expect(t.encoded()).toEqual(
      "References: <1234@test.lindsaar.net>\r\n <5678@test.lindsaar.net>\r\n",
    );
  });
  it("should accept no message ids", () => {
    const t = new ReferencesField("");
    expect(t.name).toEqual("References");
    expect(t.decoded()).toBeNull();
  });
  it("should output lines shorter than 998 chars", () => {
    const k = new ReferencesField(
      "<Kohciuku@apholoVu.com> <foovohPu@Thegahsh.com> <UuseZeow@oocieBie.com> <UchaeKoo@eeJoukie.com> <ieKahque@ieGoochu.com> <aZaXaeva@ungaiGai.com> <sheiraiK@ookaiSha.com> <weijooPi@ahfuRaeh.com> <FiruJeur@weiphohP.com> <cuadoiQu@aiZuuqua.com> <YohGieVe@Reacepae.com> <Ieyechum@ephooGho.com> <uGhievoo@vusaeciM.com> <ouhieTha@leizaeTi.com> <ohgohGhu@jieNgooh.com> <ahNookah@oChiecoo.com> <taeWieTu@iuwiLooZ.com> <Kohraiji@AizohGoa.com> <hiQuaegh@eeluThii.com> <Uunaesoh@UogheeCh.com> <JeQuahMa@Thahchoh.com> <aaxohJoh@ahfaeCho.com> <Pahneehu@eehooChi.com> <angeoKah@Wahsaeme.com> <ietovoaV@muewaeZi.com> <aebiuZur@oteeYaiF.com> <pheiXahw@Muquahba.com> <aNgiaPha@bohliNge.com> <Eikawohf@IevaiQuu.com> <gihaeduZ@Raighiey.com> <Theequoh@hoamaeSa.com> <VeiVooyi@aimuQuoo.com> <ahGoocie@BohpheVi.com> <roivahPa@uPhoghai.com> <gioZohli@Gaochoow.com> <eireLair@phaevieR.com> <TahthaeC@oolaiBei.com> <phuYeika@leiKauPh.com> <BieYenoh@Xaebaalo.com> <xohvaeWa@ahghaeRe.com> <thoQuohV@Ubooheay.com> <pheeWohV@feicaeNg.com>",
    );
    const lines = k.encoded().split("\r\n ");
    lines.forEach((line) => expect(line.length).toBeLessThan(998));
  });
  it("should handle comma-separated values", () => {
    const t = new ReferencesField("<1234@test.lindsaar.net>, <5678@test.lindsaar.net>");
    expect(t.name).toEqual("References");
    expect(t.value).toEqual("<1234@test.lindsaar.net>, <5678@test.lindsaar.net>");
    expect(t.messageId()).toEqual("1234@test.lindsaar.net");
    expect(t.messageIds()).toEqual(["1234@test.lindsaar.net", "5678@test.lindsaar.net"]);
    expect(t.toString()).toEqual("<1234@test.lindsaar.net> <5678@test.lindsaar.net>");
  });
  it("should be able to parse |2a26f8f146e27159@domain.com@domain.com, 2a26f8f146e27159@domain.com@domain.com|", () => {
    const m = new ReferencesField(
      "2a26f8f146e27159@domain.com@domain.com, 4769770500E92399@n064.sc1.he.tucows.com",
    );
    expect(m.messageIds()).toEqual([
      "2a26f8f146e27159@domain.com@domain.com",
      "4769770500E92399@n064.sc1.he.tucows.com",
    ]);
  });
  it("should be able to parse |2a26f8f146e27159@domain.com@domain.com 2a26f8f146e27159@domain.com@domain.com|", () => {
    const m = new ReferencesField(
      "2a26f8f146e27159@domain.com@domain.com 4769770500E92399@n064.sc1.he.tucows.com",
    );
    expect(m.messageIds()).toEqual([
      "2a26f8f146e27159@domain.com@domain.com",
      "4769770500E92399@n064.sc1.he.tucows.com",
    ]);
  });
});
