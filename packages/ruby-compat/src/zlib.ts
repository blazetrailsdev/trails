/**
 * `Zlib` (`vendor/ruby/ext/zlib/zlib.c:4659`), the sliver of it trails calls.
 *
 * Rails reaches this module from more than one file — `Zlib.crc32(db_name_hash)`
 * for the advisory-lock id in
 * `vendor/rails/activerecord/lib/active_record/migration.rb:1617`, and
 * `host % (Zlib.crc32(source) % 4)` in
 * `vendor/rails/actionview/lib/action_view/helpers/asset_url_helper.rb:295`
 * (its `require "zlib"` at `asset_url_helper.rb:3`) — and Ruby has exactly one
 * `Zlib`, so trails has exactly one too.
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib `Zlib`
 * (`vendor/ruby/ext/zlib/zlib.c:4659`), which Rails calls without defining, so
 * no Rails or gem file declares the module this file's single export lives in.
 */
export const Zlib = {
  /**
   * `vendor/ruby/ext/zlib/zlib.c:507` `rb_zlib_crc32`, which is
   * `do_checksum(argc, argv, crc32)` (`zlib.c:410`): `crc` seeds `sum`, an
   * omitted `string` answers that seed unchanged (`zlib.c:428`), and otherwise
   * `sum` is folded over the String's BYTES (`zlib.c:441`) — so a multibyte
   * String is digested as its UTF-8 encoding.
   *
   * @noRailsEquivalent PERMANENT — Ruby stdlib `Zlib.crc32`
   * (`vendor/ruby/ext/zlib/zlib.c:507`).
   */
  crc32(string = "", crc = 0): number {
    let sum = ~crc >>> 0;
    for (const byte of new TextEncoder().encode(string)) {
      sum ^= byte;
      for (let i = 0; i < 8; i++) {
        sum = (sum >>> 1) ^ (sum & 1 ? 0xedb88320 : 0);
      }
    }
    return (sum ^ 0xffffffff) >>> 0;
  },
};
