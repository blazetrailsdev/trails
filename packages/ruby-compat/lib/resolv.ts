const IPV4_REGEX256 = "0|1(?:[0-9][0-9]?)?|2(?:[0-4][0-9]?|5[0-5]?|[6-9])?|[3-9][0-9]?";
const HEX_GROUPS = "(?:[0-9A-Fa-f]{1,4}(?::[0-9A-Fa-f]{1,4})*)?";

/**
 * Ruby stdlib `Resolv::IPv4` (`vendor/ruby/v3.3.11/lib/resolv.rb:2834`), its
 * address regexes only.
 *
 * @noRailsEquivalent PERMANENT
 */
const IPv4 = {
  /** `Resolv::IPv4::Regex256` (`vendor/ruby/v3.3.11/lib/resolv.rb:2839-2842`). */
  Regex256: new RegExp(IPV4_REGEX256),
  /** `Resolv::IPv4::Regex` (`vendor/ruby/v3.3.11/lib/resolv.rb:2843`). */
  Regex: new RegExp(
    `^(${IPV4_REGEX256})\\.(${IPV4_REGEX256})\\.(${IPV4_REGEX256})\\.(${IPV4_REGEX256})$`,
  ),
};

const IPV6_FORMS = {
  /** `Resolv::IPv6::Regex_8Hex` (`vendor/ruby/v3.3.11/lib/resolv.rb:2917-2920`). */
  Regex_8Hex: /^(?:[0-9A-Fa-f]{1,4}:){7}[0-9A-Fa-f]{1,4}$/,
  /** `Resolv::IPv6::Regex_CompressedHex` (`vendor/ruby/v3.3.11/lib/resolv.rb:2925-2928`). */
  Regex_CompressedHex: new RegExp(`^(${HEX_GROUPS})::(${HEX_GROUPS})$`),
  /** `Resolv::IPv6::Regex_6Hex4Dec` (`vendor/ruby/v3.3.11/lib/resolv.rb:2933-2936`). */
  Regex_6Hex4Dec: /^((?:[0-9A-Fa-f]{1,4}:){6,6})(\d+)\.(\d+)\.(\d+)\.(\d+)$/,
  /** `Resolv::IPv6::Regex_CompressedHex4Dec` (`vendor/ruby/v3.3.11/lib/resolv.rb:2941-2945`). */
  Regex_CompressedHex4Dec: new RegExp(
    `^(${HEX_GROUPS})::((?:[0-9A-Fa-f]{1,4}:)*)(\\d+)\\.(\\d+)\\.(\\d+)\\.(\\d+)$`,
  ),
  /** `Resolv::IPv6::Regex_8HexLinkLocal` (`vendor/ruby/v3.3.11/lib/resolv.rb:2949-2953`). */
  Regex_8HexLinkLocal: /^[Ff][Ee]80(?::[0-9A-Fa-f]{1,4}){7}%[-0-9A-Za-z._~]+$/,
  /** `Resolv::IPv6::Regex_CompressedHexLinkLocal` (`vendor/ruby/v3.3.11/lib/resolv.rb:2958-2967`). */
  Regex_CompressedHexLinkLocal: new RegExp(
    `^[Ff][Ee]80:(?:(${HEX_GROUPS})::(${HEX_GROUPS})|:(${HEX_GROUPS}))?:[0-9A-Fa-f]{1,4}%[-0-9A-Za-z._~]+$`,
  ),
};

/**
 * Ruby stdlib `Resolv::IPv6` (`vendor/ruby/v3.3.11/lib/resolv.rb:2913`), its
 * address regexes only.
 *
 * @noRailsEquivalent PERMANENT
 */
const IPv6 = {
  ...IPV6_FORMS,
  /** `Resolv::IPv6::Regex` (`vendor/ruby/v3.3.11/lib/resolv.rb:2972-2979`). */
  Regex: new RegExp(
    Object.values(IPV6_FORMS)
      .map((r) => `(?:${r.source})`)
      .join("|"),
  ),
};

/**
 * Ruby's `Resolv` class (`vendor/ruby/v3.3.11/lib/resolv.rb:38`).
 *
 * @noRailsEquivalent PERMANENT
 */
export const Resolv = { IPv4, IPv6 };
