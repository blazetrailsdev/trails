/**
 * Mirrors: active_support/locale/en.yml and active_support/locale/en.rb.
 *
 * Rails ships the `en` locale as two files on `I18n.load_path` — a YAML file
 * for the data and a Ruby file for the `number.nth` lambdas. Translation-file
 * loading is not ported yet (story `i18n-backend-file-loading-localize`), so
 * both live here as one module, keyed exactly as the two files are and stored
 * into the backend by `i18n.ts`.
 *
 * The `number.format` / `number.currency` / ... branch of en.yml is not here
 * yet: `NumberConverter::DEFAULTS` still carries those values in trails, so
 * storing them would change what the converters read.
 */

import type { TranslationData } from "@blazetrails/i18n";
import { ordinal } from "../inflector.js";

export const en: TranslationData = {
  date: {
    formats: {
      // Use the strftime parameters for formats.
      // When no format has been given, it uses default.
      // You can provide other formats here if you like!
      default: "%Y-%m-%d",
      short: "%b %d",
      long: "%B %d, %Y",
    },

    day_names: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
    abbr_day_names: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],

    // Don't forget the nil at the beginning; there's no such thing as a 0th month
    month_names: [
      null,
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ],
    abbr_month_names: [
      null,
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ],
    // Used in date_select and datetime_select.
    order: ["year", "month", "day"],
  },

  time: {
    formats: {
      default: "%a, %d %b %Y %H:%M:%S %z",
      short: "%d %b %H:%M",
      long: "%B %d, %Y %H:%M",
    },
    am: "am",
    pm: "pm",
  },

  // Used in array.to_sentence.
  support: {
    array: {
      words_connector: ", ",
      two_words_connector: " and ",
      last_word_connector: ", and ",
    },
  },

  number: {
    nth: {
      ordinals: (_key: unknown, options: { number?: unknown }) => {
        const number = Number(options.number);
        switch (number) {
          case 1:
            return "st";
          case 2:
            return "nd";
          case 3:
            return "rd";
          case 4:
          case 5:
          case 6:
          case 7:
          case 8:
          case 9:
          case 10:
          case 11:
          case 12:
          case 13:
            return "th";
        }
        let numModulo = Math.abs(Math.trunc(number)) % 100;
        if (numModulo > 13) numModulo %= 10;
        switch (numModulo) {
          case 1:
            return "st";
          case 2:
            return "nd";
          case 3:
            return "rd";
          default:
            return "th";
        }
      },

      ordinalized: (_key: unknown, options: { number?: unknown }) =>
        `${options.number}${ordinal(Number(options.number))}`,
    },
  },
};
