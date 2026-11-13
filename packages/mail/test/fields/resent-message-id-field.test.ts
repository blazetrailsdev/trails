import { describe, expect, it } from "vitest";
import { ResentMessageIdField } from "../../lib/fields/resent-message-id-field.js";

describe("Mail::ResentMessageIdField", () => {
  it("should initialize", () => {
    expect(() => new ResentMessageIdField("<1234@test.lindsaar.net>")).not.toThrow();
  });
  it("should accept a string without the field name", () => {
    const t = new ResentMessageIdField("<1234@test.lindsaar.net>");
    expect(t.name).toEqual("Resent-Message-ID");
    expect(t.value).toEqual("<1234@test.lindsaar.net>");
    expect(t.messageId()).toEqual("1234@test.lindsaar.net");
  });
  it("should output lines shorter than 998 chars", () => {
    const k = new ResentMessageIdField(
      "<Kohciuku@apholoVu.com> <foovohPu@Thegahsh.com> <UuseZeow@oocieBie.com> <UchaeKoo@eeJoukie.com> <ieKahque@ieGoochu.com> <aZaXaeva@ungaiGai.com> <sheiraiK@ookaiSha.com> <weijooPi@ahfuRaeh.com> <FiruJeur@weiphohP.com> <cuadoiQu@aiZuuqua.com> <YohGieVe@Reacepae.com> <Ieyechum@ephooGho.com> <uGhievoo@vusaeciM.com> <ouhieTha@leizaeTi.com> <ohgohGhu@jieNgooh.com> <ahNookah@oChiecoo.com> <taeWieTu@iuwiLooZ.com> <Kohraiji@AizohGoa.com> <hiQuaegh@eeluThii.com> <Uunaesoh@UogheeCh.com> <JeQuahMa@Thahchoh.com> <aaxohJoh@ahfaeCho.com> <Pahneehu@eehooChi.com> <angeoKah@Wahsaeme.com> <ietovoaV@muewaeZi.com> <aebiuZur@oteeYaiF.com> <pheiXahw@Muquahba.com> <aNgiaPha@bohliNge.com> <Eikawohf@IevaiQuu.com> <gihaeduZ@Raighiey.com> <Theequoh@hoamaeSa.com> <VeiVooyi@aimuQuoo.com> <ahGoocie@BohpheVi.com> <roivahPa@uPhoghai.com> <gioZohli@Gaochoow.com> <eireLair@phaevieR.com> <TahthaeC@oolaiBei.com> <phuYeika@leiKauPh.com> <BieYenoh@Xaebaalo.com> <xohvaeWa@ahghaeRe.com> <thoQuohV@Ubooheay.com> <pheeWohV@feicaeNg.com>",
    );
    const lines = k.encoded().split("\r\n ");
    for (const line of lines) expect(line.length).toBeLessThan(998);
  });
});
