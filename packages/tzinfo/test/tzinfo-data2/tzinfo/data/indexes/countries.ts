import { TopLevel, include, type Extended } from "@blazetrails/ruby-compat";

type Namespace = { [name: string]: unknown };
type Format2 = NonNullable<typeof TopLevel.TZInfo>["Format2"];

const TZInfo = TopLevel.TZInfo! as NonNullable<typeof TopLevel.TZInfo> & Namespace;
const Data = (TZInfo.Data ??= {}) as Namespace;
const Indexes = (Data.Indexes ??= {}) as Namespace;
const Countries = (Indexes.Countries ??= {}) as Namespace;
include(Countries, TZInfo.Format2.CountryIndexDefinition);
(Countries as unknown as Extended<Format2["CountryIndexDefinition"]["ClassMethods"]>).countryIndex(
  (i) => {
    i.timezone("t1", "Africa/Abidjan", 319, 60, -121, 30);
    i.timezone("t2", "Africa/Johannesburg", -105, 4, 28, 1);
    i.timezone("t3", "Africa/Lagos", 129, 20, 17, 5, "West Africa Time");
    i.timezone("t4", "Africa/Maputo", -779, 30, 391, 12, "Central Africa Time");
    i.timezone("t5", "Africa/Nairobi", -77, 60, 2209, 60);
    i.timezone("t6", "America/Curacao", 731, 60, -69, 1);
    i.timezone("t7", "America/Panama", 269, 30, -1193, 15);
    i.timezone("t8", "America/Port_of_Spain", 213, 20, -3691, 60);
    i.timezone("t9", "Asia/Bangkok", 55, 4, 6031, 60, "Indochina (most areas)");
    i.timezone("t10", "Asia/Dubai", 253, 10, 553, 10);
    i.timezone("t11", "Asia/Qatar", 1517, 60, 773, 15);
    i.timezone("t12", "Asia/Riyadh", 739, 30, 2803, 60);
    i.timezone("t13", "Europe/Belgrade", 269, 6, 41, 2);
    i.timezone("t14", "Europe/Helsinki", 361, 6, 749, 30);
    i.timezone("t15", "Europe/London", 6181, 120, -451, 3600);
    i.timezone("t16", "Europe/Oslo", 719, 12, 43, 4);
    i.timezone("t17", "Europe/Prague", 601, 12, 433, 30);
    i.timezone("t18", "Europe/Rome", 419, 10, 749, 60);
    i.timezone("t19", "Europe/Zurich", 2843, 60, 128, 15, "Swiss time");
    i.timezone("t20", "Indian/Reunion", -313, 15, 832, 15, "Réunion, Crozet, Scattered Islands");
    i.timezone("t21", "Pacific/Auckland", -553, 15, 5243, 30, "New Zealand time");
    i.timezone("t22", "Pacific/Guam", 202, 15, 579, 4);
    i.timezone("t23", "Pacific/Honolulu", 15341, 720, -18943, 120, "Hawaii");
    i.timezone("t24", "Pacific/Pago_Pago", -214, 15, -1707, 10, "Samoa, Midway");
    i.country("AD", "Andorra", (c) => {
      c.timezone("Europe/Andorra", 85, 2, 91, 60);
    });
    i.country("AE", "United Arab Emirates", (c) => {
      c.timezone("t10");
    });
    i.country("AF", "Afghanistan", (c) => {
      c.timezone("Asia/Kabul", 2071, 60, 346, 5);
    });
    i.country("AG", "Antigua & Barbuda", (c) => {
      c.timezone("t8");
    });
    i.country("AI", "Anguilla", (c) => {
      c.timezone("t8");
    });
    i.country("AL", "Albania", (c) => {
      c.timezone("Europe/Tirane", 124, 3, 119, 6);
    });
    i.country("AM", "Armenia", (c) => {
      c.timezone("Asia/Yerevan", 2411, 60, 89, 2);
    });
    i.country("AO", "Angola", (c) => {
      c.timezone("t3");
    });
    i.country("AQ", "Antarctica", (c) => {
      c.timezone("Antarctica/Casey", -3977, 60, 6631, 60, "Casey");
      c.timezone("Antarctica/Davis", -823, 12, 2339, 30, "Davis");
      c.timezone("Antarctica/DumontDUrville", -200, 3, 8401, 60, "Dumont-d'Urville");
      c.timezone("Antarctica/Mawson", -338, 5, 3773, 60, "Mawson");
      c.timezone("Antarctica/Palmer", -324, 5, -641, 10, "Palmer");
      c.timezone("Antarctica/Rothera", -2027, 30, -1022, 15, "Rothera");
      c.timezone("Antarctica/Syowa", -124211, 1800, 3959, 100, "Syowa");
      c.timezone("Antarctica/Troll", -259241, 3600, 507, 200, "Troll");
      c.timezone("Antarctica/Vostok", -392, 5, 1069, 10, "Vostok");
      c.timezone("t21");
    });
    i.country("AR", "Argentina", (c) => {
      c.timezone("America/Argentina/Buenos_Aires", -173, 5, -1169, 20, "Buenos Aires (BA, CF)");
      c.timezone(
        "America/Argentina/Cordoba",
        -157,
        5,
        -3851,
        60,
        "Argentina (most areas: CB, CC, CN, ER, FM, MN, SE, SF)",
      );
      c.timezone("America/Argentina/Salta", -1487, 60, -785, 12, "Salta (SA, LP, NQ, RN)");
      c.timezone("America/Argentina/Jujuy", -1451, 60, -653, 10, "Jujuy (JY)");
      c.timezone("America/Argentina/Tucuman", -1609, 60, -3913, 60, "Tucumán (TM)");
      c.timezone("America/Argentina/Catamarca", -427, 15, -3947, 60, "Catamarca (CT); Chubut (CH)");
      c.timezone("America/Argentina/La_Rioja", -883, 30, -1337, 20, "La Rioja (LR)");
      c.timezone("America/Argentina/San_Juan", -473, 15, -4111, 60, "San Juan (SJ)");
      c.timezone("America/Argentina/Mendoza", -1973, 60, -4129, 60, "Mendoza (MZ)");
      c.timezone("America/Argentina/San_Luis", -1999, 60, -1327, 20, "San Luis (SL)");
      c.timezone("America/Argentina/Rio_Gallegos", -1549, 30, -4153, 60, "Santa Cruz (SC)");
      c.timezone("America/Argentina/Ushuaia", -274, 5, -683, 10, "Tierra del Fuego (TF)");
    });
    i.country("AS", "Samoa (American)", (c) => {
      c.timezone("t24");
    });
    i.country("AT", "Austria", (c) => {
      c.timezone("Europe/Vienna", 2893, 60, 49, 3);
    });
    i.country("AU", "Australia", (c) => {
      c.timezone("Australia/Lord_Howe", -631, 20, 1909, 12, "Lord Howe Island");
      c.timezone("Antarctica/Macquarie", -109, 2, 3179, 20, "Macquarie Island");
      c.timezone("Australia/Hobart", -2573, 60, 8839, 60, "Tasmania (most areas)");
      c.timezone("Australia/Currie", -599, 15, 2158, 15, "Tasmania (King Island)");
      c.timezone("Australia/Melbourne", -2269, 60, 4349, 30, "Victoria");
      c.timezone("Australia/Sydney", -508, 15, 9073, 60, "New South Wales (most areas)");
      c.timezone("Australia/Broken_Hill", -639, 20, 2829, 20, "New South Wales (Yancowinna)");
      c.timezone("Australia/Brisbane", -412, 15, 4591, 30, "Queensland (most areas)");
      c.timezone("Australia/Lindeman", -304, 15, 149, 1, "Queensland (Whitsunday Islands)");
      c.timezone("Australia/Adelaide", -419, 12, 1663, 12, "South Australia");
      c.timezone("Australia/Darwin", -187, 15, 785, 6, "Northern Territory");
      c.timezone("Australia/Perth", -639, 20, 2317, 20, "Western Australia (most areas)");
      c.timezone("Australia/Eucla", -1903, 60, 1933, 15, "Western Australia (Eucla)");
    });
    i.country("AW", "Aruba", (c) => {
      c.timezone("t6");
    });
    i.country("AX", "Åland Islands", (c) => {
      c.timezone("t14");
    });
    i.country("AZ", "Azerbaijan", (c) => {
      c.timezone("Asia/Baku", 2423, 60, 997, 20);
    });
    i.country("BA", "Bosnia & Herzegovina", (c) => {
      c.timezone("t13");
    });
    i.country("BB", "Barbados", (c) => {
      c.timezone("America/Barbados", 131, 10, -3577, 60);
    });
    i.country("BD", "Bangladesh", (c) => {
      c.timezone("Asia/Dhaka", 1423, 60, 1085, 12);
    });
    i.country("BE", "Belgium", (c) => {
      c.timezone("Europe/Brussels", 305, 6, 13, 3);
    });
    i.country("BF", "Burkina Faso", (c) => {
      c.timezone("t1");
    });
    i.country("BG", "Bulgaria", (c) => {
      c.timezone("Europe/Sofia", 2561, 60, 1399, 60);
    });
    i.country("BH", "Bahrain", (c) => {
      c.timezone("t11");
    });
    i.country("BI", "Burundi", (c) => {
      c.timezone("t4");
    });
    i.country("BJ", "Benin", (c) => {
      c.timezone("t3");
    });
    i.country("BL", "St Barthelemy", (c) => {
      c.timezone("t8");
    });
    i.country("BM", "Bermuda", (c) => {
      c.timezone("Atlantic/Bermuda", 1937, 60, -1943, 30);
    });
    i.country("BN", "Brunei", (c) => {
      c.timezone("Asia/Brunei", 74, 15, 1379, 12);
    });
    i.country("BO", "Bolivia", (c) => {
      c.timezone("America/La_Paz", -33, 2, -1363, 20);
    });
    i.country("BQ", "Caribbean NL", (c) => {
      c.timezone("t6");
    });
    i.country("BR", "Brazil", (c) => {
      c.timezone("America/Noronha", -77, 20, -389, 12, "Atlantic islands");
      c.timezone("America/Belem", -29, 20, -2909, 60, "Pará (east); Amapá");
      c.timezone("America/Fortaleza", -223, 60, -77, 2, "Brazil (northeast: MA, PI, CE, RN, PB)");
      c.timezone("America/Recife", -161, 20, -349, 10, "Pernambuco");
      c.timezone("America/Araguaina", -36, 5, -241, 5, "Tocantins");
      c.timezone("America/Maceio", -29, 3, -2143, 60, "Alagoas, Sergipe");
      c.timezone("America/Bahia", -779, 60, -2311, 60, "Bahia");
      c.timezone(
        "America/Sao_Paulo",
        -353,
        15,
        -2797,
        60,
        "Brazil (southeast: GO, DF, MG, ES, RJ, SP, PR, SC, RS)",
      );
      c.timezone("America/Campo_Grande", -409, 20, -3277, 60, "Mato Grosso do Sul");
      c.timezone("America/Cuiaba", -187, 12, -673, 12, "Mato Grosso");
      c.timezone("America/Santarem", -73, 30, -823, 15, "Pará (west)");
      c.timezone("America/Porto_Velho", -263, 30, -639, 10, "Rondônia");
      c.timezone("America/Boa_Vista", 169, 60, -182, 3, "Roraima");
      c.timezone("America/Manaus", -47, 15, -3601, 60, "Amazonas (east)");
      c.timezone("America/Eirunepe", -20, 3, -1048, 15, "Amazonas (west)");
      c.timezone("America/Rio_Branco", -299, 30, -339, 5, "Acre");
    });
    i.country("BS", "Bahamas", (c) => {
      c.timezone("America/Nassau", 301, 12, -1547, 20);
    });
    i.country("BT", "Bhutan", (c) => {
      c.timezone("Asia/Thimphu", 412, 15, 1793, 20);
    });
    i.country("BV", "Bouvet Island");
    i.country("BW", "Botswana", (c) => {
      c.timezone("t4");
    });
    i.country("BY", "Belarus", (c) => {
      c.timezone("Europe/Minsk", 539, 10, 827, 30);
    });
    i.country("BZ", "Belize", (c) => {
      c.timezone("America/Belize", 35, 2, -441, 5);
    });
    i.country("CA", "Canada", (c) => {
      c.timezone("America/St_Johns", 1427, 30, -3163, 60, "Newfoundland; Labrador (southeast)");
      c.timezone("America/Halifax", 893, 20, -318, 5, "Atlantic - NS (most areas); PE");
      c.timezone("America/Glace_Bay", 231, 5, -1199, 20, "Atlantic - NS (Cape Breton)");
      c.timezone("America/Moncton", 461, 10, -3887, 60, "Atlantic - New Brunswick");
      c.timezone("America/Goose_Bay", 160, 3, -725, 12, "Atlantic - Labrador (most areas)");
      c.timezone("America/Blanc-Sablon", 617, 12, -3427, 60, "AST - QC (Lower North Shore)");
      c.timezone("America/Toronto", 873, 20, -4763, 60, "Eastern - ON, QC (most areas)");
      c.timezone("America/Nipigon", 2941, 60, -1324, 15, "Eastern - ON, QC (no DST 1967-73)");
      c.timezone("America/Thunder_Bay", 2903, 60, -357, 4, "Eastern - ON (Thunder Bay)");
      c.timezone("America/Iqaluit", 956, 15, -1027, 15, "Eastern - NU (most east areas)");
      c.timezone("America/Pangnirtung", 992, 15, -986, 15, "Eastern - NU (Pangnirtung)");
      c.timezone(
        "America/Atikokan",
        175531,
        3600,
        -54973,
        600,
        "EST - ON (Atikokan); NU (Coral H)",
      );
      c.timezone("America/Winnipeg", 2993, 60, -1943, 20, "Central - ON (west); Manitoba");
      c.timezone("America/Rainy_River", 2923, 60, -2837, 30, "Central - ON (Rainy R, Ft Frances)");
      c.timezone("America/Resolute", 33613, 450, -22759, 240, "Central - NU (Resolute)");
      c.timezone("America/Rankin_Inlet", 3769, 60, -331499, 3600, "Central - NU (central)");
      c.timezone("America/Regina", 252, 5, -2093, 20, "CST - SK (most areas)");
      c.timezone("America/Swift_Current", 3017, 60, -647, 6, "CST - SK (midwest)");
      c.timezone("America/Edmonton", 1071, 20, -1702, 15, "Mountain - AB; BC (E); SK (W)");
      c.timezone("America/Cambridge_Bay", 24881, 360, -37819, 360, "Mountain - NU (west)");
      c.timezone("America/Yellowknife", 1249, 20, -2287, 20, "Mountain - NT (central)");
      c.timezone("America/Inuvik", 246059, 3600, -8023, 60, "Mountain - NT (west)");
      c.timezone("America/Creston", 491, 10, -6991, 60, "MST - BC (Creston)");
      c.timezone("America/Dawson_Creek", 1793, 30, -3607, 30, "MST - BC (Dawson Cr, Ft St John)");
      c.timezone("America/Fort_Nelson", 294, 5, -1227, 10, "MST - BC (Ft Nelson)");
      c.timezone("America/Vancouver", 739, 15, -7387, 60, "Pacific - BC (most areas)");
      c.timezone("America/Whitehorse", 3643, 60, -2701, 20, "Pacific - Yukon (east)");
      c.timezone("America/Dawson", 961, 15, -1673, 12, "Pacific - Yukon (west)");
    });
    i.country("CC", "Cocos (Keeling) Islands", (c) => {
      c.timezone("Indian/Cocos", -73, 6, 1163, 12);
    });
    i.country("CD", "Congo (Dem. Rep.)", (c) => {
      c.timezone("t4");
      c.timezone("t3");
    });
    i.country("CF", "Central African Rep.", (c) => {
      c.timezone("t3");
    });
    i.country("CG", "Congo (Rep.)", (c) => {
      c.timezone("t3");
    });
    i.country("CH", "Switzerland", (c) => {
      c.timezone("t19");
    });
    i.country("CI", "Côte d'Ivoire", (c) => {
      c.timezone("t1");
    });
    i.country("CK", "Cook Islands", (c) => {
      c.timezone("Pacific/Rarotonga", -637, 30, -4793, 30);
    });
    i.country("CL", "Chile", (c) => {
      c.timezone("America/Santiago", -669, 20, -212, 3, "Chile (most areas)");
      c.timezone("America/Punta_Arenas", -1063, 20, -851, 12, "Region of Magallanes");
      c.timezone("Pacific/Easter", -543, 20, -3283, 30, "Easter Island");
    });
    i.country("CM", "Cameroon", (c) => {
      c.timezone("t3");
    });
    i.country("CN", "China", (c) => {
      c.timezone("Asia/Shanghai", 937, 30, 1822, 15, "Beijing Time");
      c.timezone("Asia/Urumqi", 219, 5, 1051, 12, "Xinjiang Time");
    });
    i.country("CO", "Colombia", (c) => {
      c.timezone("America/Bogota", 23, 5, -889, 12);
    });
    i.country("CR", "Costa Rica", (c) => {
      c.timezone("America/Costa_Rica", 149, 15, -1009, 12);
    });
    i.country("CU", "Cuba", (c) => {
      c.timezone("America/Havana", 347, 15, -2471, 30);
    });
    i.country("CV", "Cape Verde", (c) => {
      c.timezone("Atlantic/Cape_Verde", 179, 12, -1411, 60);
    });
    i.country("CW", "Curaçao", (c) => {
      c.timezone("t6");
    });
    i.country("CX", "Christmas Island", (c) => {
      c.timezone("Indian/Christmas", -125, 12, 6343, 60);
    });
    i.country("CY", "Cyprus", (c) => {
      c.timezone("Asia/Nicosia", 211, 6, 1001, 30, "Cyprus (most areas)");
      c.timezone("Asia/Famagusta", 2107, 60, 679, 20, "Northern Cyprus");
    });
    i.country("CZ", "Czech Republic", (c) => {
      c.timezone("t17");
    });
    i.country("DE", "Germany", (c) => {
      c.timezone("Europe/Berlin", 105, 2, 401, 30, "Germany (most areas)");
      c.timezone("t19");
    });
    i.country("DJ", "Djibouti", (c) => {
      c.timezone("t5");
    });
    i.country("DK", "Denmark", (c) => {
      c.timezone("Europe/Copenhagen", 167, 3, 151, 12);
    });
    i.country("DM", "Dominica", (c) => {
      c.timezone("t8");
    });
    i.country("DO", "Dominican Republic", (c) => {
      c.timezone("America/Santo_Domingo", 277, 15, -699, 10);
    });
    i.country("DZ", "Algeria", (c) => {
      c.timezone("Africa/Algiers", 2207, 60, 61, 20);
    });
    i.country("EC", "Ecuador", (c) => {
      c.timezone("America/Guayaquil", -13, 6, -479, 6, "Ecuador (mainland)");
      c.timezone("Pacific/Galapagos", -9, 10, -448, 5, "Galápagos Islands");
    });
    i.country("EE", "Estonia", (c) => {
      c.timezone("Europe/Tallinn", 713, 12, 99, 4);
    });
    i.country("EG", "Egypt", (c) => {
      c.timezone("Africa/Cairo", 601, 20, 125, 4);
    });
    i.country("EH", "Western Sahara", (c) => {
      c.timezone("Africa/El_Aaiun", 543, 20, -66, 5);
    });
    i.country("ER", "Eritrea", (c) => {
      c.timezone("t5");
    });
    i.country("ES", "Spain", (c) => {
      c.timezone("Europe/Madrid", 202, 5, -221, 60, "Spain (mainland)");
      c.timezone("Africa/Ceuta", 2153, 60, -319, 60, "Ceuta, Melilla");
      c.timezone("Atlantic/Canary", 281, 10, -77, 5, "Canary Islands");
    });
    i.country("ET", "Ethiopia", (c) => {
      c.timezone("t5");
    });
    i.country("FI", "Finland", (c) => {
      c.timezone("t14");
    });
    i.country("FJ", "Fiji", (c) => {
      c.timezone("Pacific/Fiji", -272, 15, 2141, 12);
    });
    i.country("FK", "Falkland Islands", (c) => {
      c.timezone("Atlantic/Stanley", -517, 10, -1157, 20);
    });
    i.country("FM", "Micronesia", (c) => {
      c.timezone("Pacific/Chuuk", 89, 12, 9107, 60, "Chuuk/Truk, Yap");
      c.timezone("Pacific/Pohnpei", 209, 30, 9493, 60, "Pohnpei/Ponape");
      c.timezone("Pacific/Kosrae", 319, 60, 9779, 60, "Kosrae");
    });
    i.country("FO", "Faroe Islands", (c) => {
      c.timezone("Atlantic/Faroe", 3721, 60, -203, 30);
    });
    i.country("FR", "France", (c) => {
      c.timezone("Europe/Paris", 733, 15, 7, 3);
    });
    i.country("GA", "Gabon", (c) => {
      c.timezone("t3");
    });
    i.country("GB", "Britain (UK)", (c) => {
      c.timezone("t15");
    });
    i.country("GD", "Grenada", (c) => {
      c.timezone("t8");
    });
    i.country("GE", "Georgia", (c) => {
      c.timezone("Asia/Tbilisi", 2503, 60, 2689, 60);
    });
    i.country("GF", "French Guiana", (c) => {
      c.timezone("America/Cayenne", 74, 15, -157, 3);
    });
    i.country("GG", "Guernsey", (c) => {
      c.timezone("t15");
    });
    i.country("GH", "Ghana", (c) => {
      c.timezone("Africa/Accra", 111, 20, -13, 60);
    });
    i.country("GI", "Gibraltar", (c) => {
      c.timezone("Europe/Gibraltar", 542, 15, -107, 20);
    });
    i.country("GL", "Greenland", (c) => {
      c.timezone("America/Nuuk", 3851, 60, -776, 15, "Greenland (most areas)");
      c.timezone("America/Danmarkshavn", 2303, 30, -56, 3, "National Park (east coast)");
      c.timezone("America/Scoresbysund", 4229, 60, -659, 30, "Scoresbysund/Ittoqqortoormiit");
      c.timezone("America/Thule", 2297, 30, -4127, 60, "Thule/Pituffik");
    });
    i.country("GM", "Gambia", (c) => {
      c.timezone("t1");
    });
    i.country("GN", "Guinea", (c) => {
      c.timezone("t1");
    });
    i.country("GP", "Guadeloupe", (c) => {
      c.timezone("t8");
    });
    i.country("GQ", "Equatorial Guinea", (c) => {
      c.timezone("t3");
    });
    i.country("GR", "Greece", (c) => {
      c.timezone("Europe/Athens", 1139, 30, 1423, 60);
    });
    i.country("GS", "South Georgia & the South Sandwich Islands", (c) => {
      c.timezone("Atlantic/South_Georgia", -814, 15, -548, 15);
    });
    i.country("GT", "Guatemala", (c) => {
      c.timezone("America/Guatemala", 439, 30, -5431, 60);
    });
    i.country("GU", "Guam", (c) => {
      c.timezone("t22");
    });
    i.country("GW", "Guinea-Bissau", (c) => {
      c.timezone("Africa/Bissau", 237, 20, -187, 12);
    });
    i.country("GY", "Guyana", (c) => {
      c.timezone("America/Guyana", 34, 5, -349, 6);
    });
    i.country("HK", "Hong Kong", (c) => {
      c.timezone("Asia/Hong_Kong", 1337, 60, 2283, 20);
    });
    i.country("HM", "Heard Island & McDonald Islands");
    i.country("HN", "Honduras", (c) => {
      c.timezone("America/Tegucigalpa", 141, 10, -5233, 60);
    });
    i.country("HR", "Croatia", (c) => {
      c.timezone("t13");
    });
    i.country("HT", "Haiti", (c) => {
      c.timezone("America/Port-au-Prince", 278, 15, -217, 3);
    });
    i.country("HU", "Hungary", (c) => {
      c.timezone("Europe/Budapest", 95, 2, 229, 12);
    });
    i.country("ID", "Indonesia", (c) => {
      c.timezone("Asia/Jakarta", -37, 6, 534, 5, "Java, Sumatra");
      c.timezone("Asia/Pontianak", -1, 30, 328, 3, "Borneo (west, central)");
      c.timezone(
        "Asia/Makassar",
        -307,
        60,
        597,
        5,
        "Borneo (east, south); Sulawesi/Celebes, Bali, Nusa Tengarra; Timor (west)",
      );
      c.timezone(
        "Asia/Jayapura",
        -38,
        15,
        1407,
        10,
        "New Guinea (West Papua / Irian Jaya); Malukus/Moluccas",
      );
    });
    i.country("IE", "Ireland", (c) => {
      c.timezone("Europe/Dublin", 160, 3, -25, 4);
    });
    i.country("IL", "Israel", (c) => {
      c.timezone("Asia/Jerusalem", 11441, 360, 63403, 1800);
    });
    i.country("IM", "Isle of Man", (c) => {
      c.timezone("t15");
    });
    i.country("IN", "India", (c) => {
      c.timezone("Asia/Kolkata", 338, 15, 2651, 30);
    });
    i.country("IO", "British Indian Ocean Territory", (c) => {
      c.timezone("Indian/Chagos", -22, 3, 869, 12);
    });
    i.country("IQ", "Iraq", (c) => {
      c.timezone("Asia/Baghdad", 667, 20, 533, 12);
    });
    i.country("IR", "Iran", (c) => {
      c.timezone("Asia/Tehran", 107, 3, 1543, 30);
    });
    i.country("IS", "Iceland", (c) => {
      c.timezone("Atlantic/Reykjavik", 1283, 20, -437, 20);
    });
    i.country("IT", "Italy", (c) => {
      c.timezone("t18");
    });
    i.country("JE", "Jersey", (c) => {
      c.timezone("t15");
    });
    i.country("JM", "Jamaica", (c) => {
      c.timezone("America/Jamaica", 12937, 720, -11519, 150);
    });
    i.country("JO", "Jordan", (c) => {
      c.timezone("Asia/Amman", 639, 20, 539, 15);
    });
    i.country("JP", "Japan", (c) => {
      c.timezone("Asia/Tokyo", 32089, 900, 503081, 3600);
    });
    i.country("KE", "Kenya", (c) => {
      c.timezone("t5");
    });
    i.country("KG", "Kyrgyzstan", (c) => {
      c.timezone("Asia/Bishkek", 429, 10, 373, 5);
    });
    i.country("KH", "Cambodia", (c) => {
      c.timezone("t9");
    });
    i.country("KI", "Kiribati", (c) => {
      c.timezone("Pacific/Tarawa", 17, 12, 173, 1, "Gilbert Islands");
      c.timezone("Pacific/Enderbury", -47, 15, -2053, 12, "Phoenix Islands");
      c.timezone("Pacific/Kiritimati", 28, 15, -472, 3, "Line Islands");
    });
    i.country("KM", "Comoros", (c) => {
      c.timezone("t5");
    });
    i.country("KN", "St Kitts & Nevis", (c) => {
      c.timezone("t8");
    });
    i.country("KP", "Korea (North)", (c) => {
      c.timezone("Asia/Pyongyang", 2341, 60, 503, 4);
    });
    i.country("KR", "Korea (South)", (c) => {
      c.timezone("Asia/Seoul", 751, 20, 3809, 30);
    });
    i.country("KW", "Kuwait", (c) => {
      c.timezone("t12");
    });
    i.country("KY", "Cayman Islands", (c) => {
      c.timezone("t7");
    });
    i.country("KZ", "Kazakhstan", (c) => {
      c.timezone("Asia/Almaty", 173, 4, 1539, 20, "Kazakhstan (most areas)");
      c.timezone("Asia/Qyzylorda", 224, 5, 982, 15, "Qyzylorda/Kyzylorda/Kzyl-Orda");
      c.timezone("Asia/Qostanay", 266, 5, 3817, 60, "Qostanay/Kostanay/Kustanay");
      c.timezone("Asia/Aqtobe", 3017, 60, 343, 6, "Aqtöbe/Aktobe");
      c.timezone("Asia/Aqtau", 2671, 60, 754, 15, "Mangghystaū/Mankistau");
      c.timezone("Asia/Atyrau", 2827, 60, 779, 15, "Atyraū/Atirau/Gur'yev");
      c.timezone("Asia/Oral", 3073, 60, 1027, 20, "West Kazakhstan");
    });
    i.country("LA", "Laos", (c) => {
      c.timezone("t9");
    });
    i.country("LB", "Lebanon", (c) => {
      c.timezone("Asia/Beirut", 2033, 60, 71, 2);
    });
    i.country("LC", "St Lucia", (c) => {
      c.timezone("t8");
    });
    i.country("LI", "Liechtenstein", (c) => {
      c.timezone("t19");
    });
    i.country("LK", "Sri Lanka", (c) => {
      c.timezone("Asia/Colombo", 104, 15, 1597, 20);
    });
    i.country("LR", "Liberia", (c) => {
      c.timezone("Africa/Monrovia", 63, 10, -647, 60);
    });
    i.country("LS", "Lesotho", (c) => {
      c.timezone("t2");
    });
    i.country("LT", "Lithuania", (c) => {
      c.timezone("Europe/Vilnius", 3281, 60, 1519, 60);
    });
    i.country("LU", "Luxembourg", (c) => {
      c.timezone("Europe/Luxembourg", 248, 5, 123, 20);
    });
    i.country("LV", "Latvia", (c) => {
      c.timezone("Europe/Riga", 1139, 20, 241, 10);
    });
    i.country("LY", "Libya", (c) => {
      c.timezone("Africa/Tripoli", 329, 10, 791, 60);
    });
    i.country("MA", "Morocco", (c) => {
      c.timezone("Africa/Casablanca", 673, 20, -91, 12);
    });
    i.country("MC", "Monaco", (c) => {
      c.timezone("Europe/Monaco", 437, 10, 443, 60);
    });
    i.country("MD", "Moldova", (c) => {
      c.timezone("Europe/Chisinau", 47, 1, 173, 6);
    });
    i.country("ME", "Montenegro", (c) => {
      c.timezone("t13");
    });
    i.country("MF", "St Martin (French)", (c) => {
      c.timezone("t8");
    });
    i.country("MG", "Madagascar", (c) => {
      c.timezone("t5");
    });
    i.country("MH", "Marshall Islands", (c) => {
      c.timezone("Pacific/Majuro", 143, 20, 856, 5, "Marshall Islands (most areas)");
      c.timezone("Pacific/Kwajalein", 109, 12, 502, 3, "Kwajalein");
    });
    i.country("MK", "North Macedonia", (c) => {
      c.timezone("t13");
    });
    i.country("ML", "Mali", (c) => {
      c.timezone("t1");
    });
    i.country("MM", "Myanmar (Burma)", (c) => {
      c.timezone("Asia/Yangon", 1007, 60, 577, 6);
    });
    i.country("MN", "Mongolia", (c) => {
      c.timezone("Asia/Ulaanbaatar", 575, 12, 6413, 60, "Mongolia (most areas)");
      c.timezone("Asia/Hovd", 2881, 60, 1833, 20, "Bayan-Ölgii, Govi-Altai, Hovd, Uvs, Zavkhan");
      c.timezone("Asia/Choibalsan", 721, 15, 229, 2, "Dornod, Sükhbaatar");
    });
    i.country("MO", "Macau", (c) => {
      c.timezone("Asia/Macau", 7991, 360, 2725, 24);
    });
    i.country("MP", "Northern Mariana Islands", (c) => {
      c.timezone("t22");
    });
    i.country("MQ", "Martinique", (c) => {
      c.timezone("America/Martinique", 73, 5, -733, 12);
    });
    i.country("MR", "Mauritania", (c) => {
      c.timezone("t1");
    });
    i.country("MS", "Montserrat", (c) => {
      c.timezone("t8");
    });
    i.country("MT", "Malta", (c) => {
      c.timezone("Europe/Malta", 359, 10, 871, 60);
    });
    i.country("MU", "Mauritius", (c) => {
      c.timezone("Indian/Mauritius", -121, 6, 115, 2);
    });
    i.country("MV", "Maldives", (c) => {
      c.timezone("Indian/Maldives", 25, 6, 147, 2);
    });
    i.country("MW", "Malawi", (c) => {
      c.timezone("t4");
    });
    i.country("MX", "Mexico", (c) => {
      c.timezone("America/Mexico_City", 97, 5, -1983, 20, "Central Time");
      c.timezone("America/Cancun", 253, 12, -2603, 30, "Eastern Standard Time - Quintana Roo");
      c.timezone("America/Merida", 629, 30, -5377, 60, "Central Time - Campeche, Yucatán");
      c.timezone(
        "America/Monterrey",
        77,
        3,
        -6019,
        60,
        "Central Time - Durango; Coahuila, Nuevo León, Tamaulipas (most areas)",
      );
      c.timezone(
        "America/Matamoros",
        155,
        6,
        -195,
        2,
        "Central Time US - Coahuila, Nuevo León, Tamaulipas (US border)",
      );
      c.timezone(
        "America/Mazatlan",
        1393,
        60,
        -1277,
        12,
        "Mountain Time - Baja California Sur, Nayarit, Sinaloa",
      );
      c.timezone("America/Chihuahua", 859, 30, -1273, 12, "Mountain Time - Chihuahua (most areas)");
      c.timezone("America/Ojinaga", 887, 30, -1253, 12, "Mountain Time US - Chihuahua (US border)");
      c.timezone("America/Hermosillo", 436, 15, -3329, 30, "Mountain Standard Time - Sonora");
      c.timezone("America/Tijuana", 488, 15, -7021, 60, "Pacific Time US - Baja California");
      c.timezone("America/Bahia_Banderas", 104, 5, -421, 4, "Central Time - Bahía de Banderas");
    });
    i.country("MY", "Malaysia", (c) => {
      c.timezone("Asia/Kuala_Lumpur", 19, 6, 1017, 10, "Malaysia (peninsula)");
      c.timezone("Asia/Kuching", 31, 20, 331, 3, "Sabah, Sarawak");
    });
    i.country("MZ", "Mozambique", (c) => {
      c.timezone("t4");
    });
    i.country("NA", "Namibia", (c) => {
      c.timezone("Africa/Windhoek", -677, 30, 171, 10);
    });
    i.country("NC", "New Caledonia", (c) => {
      c.timezone("Pacific/Noumea", -334, 15, 3329, 20);
    });
    i.country("NE", "Niger", (c) => {
      c.timezone("t3");
    });
    i.country("NF", "Norfolk Island", (c) => {
      c.timezone("Pacific/Norfolk", -581, 20, 5039, 30);
    });
    i.country("NG", "Nigeria", (c) => {
      c.timezone("t3");
    });
    i.country("NI", "Nicaragua", (c) => {
      c.timezone("America/Managua", 243, 20, -5177, 60);
    });
    i.country("NL", "Netherlands", (c) => {
      c.timezone("Europe/Amsterdam", 1571, 30, 49, 10);
    });
    i.country("NO", "Norway", (c) => {
      c.timezone("t16");
    });
    i.country("NP", "Nepal", (c) => {
      c.timezone("Asia/Kathmandu", 1663, 60, 5119, 60);
    });
    i.country("NR", "Nauru", (c) => {
      c.timezone("Pacific/Nauru", -31, 60, 2003, 12);
    });
    i.country("NU", "Niue", (c) => {
      c.timezone("Pacific/Niue", -1141, 60, -2039, 12);
    });
    i.country("NZ", "New Zealand", (c) => {
      c.timezone("t21");
      c.timezone("Pacific/Chatham", -879, 20, -3531, 20, "Chatham Islands");
    });
    i.country("OM", "Oman", (c) => {
      c.timezone("t10");
    });
    i.country("PA", "Panama", (c) => {
      c.timezone("t7");
    });
    i.country("PE", "Peru", (c) => {
      c.timezone("America/Lima", -241, 20, -1541, 20);
    });
    i.country("PF", "French Polynesia", (c) => {
      c.timezone("Pacific/Tahiti", -263, 15, -4487, 30, "Society Islands");
      c.timezone("Pacific/Marquesas", -9, 1, -279, 2, "Marquesas Islands");
      c.timezone("Pacific/Gambier", -347, 15, -2699, 20, "Gambier Islands");
    });
    i.country("PG", "Papua New Guinea", (c) => {
      c.timezone("Pacific/Port_Moresby", -19, 2, 883, 6, "Papua New Guinea (most areas)");
      c.timezone("Pacific/Bougainville", -373, 60, 4667, 30, "Bougainville");
    });
    i.country("PH", "Philippines", (c) => {
      c.timezone("Asia/Manila", 175, 12, 121, 1);
    });
    i.country("PK", "Pakistan", (c) => {
      c.timezone("Asia/Karachi", 373, 15, 1341, 20);
    });
    i.country("PL", "Poland", (c) => {
      c.timezone("Europe/Warsaw", 209, 4, 21, 1);
    });
    i.country("PM", "St Pierre & Miquelon", (c) => {
      c.timezone("America/Miquelon", 941, 20, -169, 3);
    });
    i.country("PN", "Pitcairn", (c) => {
      c.timezone("Pacific/Pitcairn", -376, 15, -1561, 12);
    });
    i.country("PR", "Puerto Rico", (c) => {
      c.timezone("America/Puerto_Rico", 11081, 600, -118991, 1800);
    });
    i.country("PS", "Palestine", (c) => {
      c.timezone("Asia/Gaza", 63, 2, 517, 15, "Gaza Strip");
      c.timezone("Asia/Hebron", 473, 15, 7019, 200, "West Bank");
    });
    i.country("PT", "Portugal", (c) => {
      c.timezone("Europe/Lisbon", 2323, 60, -137, 15, "Portugal (mainland)");
      c.timezone("Atlantic/Madeira", 979, 30, -169, 10, "Madeira Islands");
      c.timezone("Atlantic/Azores", 566, 15, -77, 3, "Azores");
    });
    i.country("PW", "Palau", (c) => {
      c.timezone("Pacific/Palau", 22, 3, 8069, 60);
    });
    i.country("PY", "Paraguay", (c) => {
      c.timezone("America/Asuncion", -379, 15, -173, 3);
    });
    i.country("QA", "Qatar", (c) => {
      c.timezone("t11");
    });
    i.country("RE", "Réunion", (c) => {
      c.timezone("t20");
    });
    i.country("RO", "Romania", (c) => {
      c.timezone("Europe/Bucharest", 1333, 30, 261, 10);
    });
    i.country("RS", "Serbia", (c) => {
      c.timezone("t13");
    });
    i.country("RU", "Russia", (c) => {
      c.timezone("Europe/Kaliningrad", 3283, 60, 41, 2, "MSK-01 - Kaliningrad");
      c.timezone("Europe/Moscow", 66907, 1200, 8464, 225, "MSK+00 - Moscow area");
      c.timezone("Europe/Simferopol", 899, 20, 341, 10, "Crimea");
      c.timezone("Europe/Kirov", 293, 5, 993, 20, "MSK+00 - Kirov");
      c.timezone("Europe/Astrakhan", 927, 20, 961, 20, "MSK+01 - Astrakhan");
      c.timezone("Europe/Volgograd", 731, 15, 533, 12, "MSK+01 - Volgograd");
      c.timezone("Europe/Saratov", 1547, 30, 1381, 30, "MSK+01 - Saratov");
      c.timezone("Europe/Ulyanovsk", 163, 3, 242, 5, "MSK+01 - Ulyanovsk");
      c.timezone("Europe/Samara", 266, 5, 1003, 20, "MSK+01 - Samara, Udmurtia");
      c.timezone("Asia/Yekaterinburg", 1137, 20, 303, 5, "MSK+02 - Urals");
      c.timezone("Asia/Omsk", 55, 1, 367, 5, "MSK+03 - Omsk");
      c.timezone("Asia/Novosibirsk", 1651, 30, 995, 12, "MSK+04 - Novosibirsk");
      c.timezone("Asia/Barnaul", 1601, 30, 335, 4, "MSK+04 - Altai");
      c.timezone("Asia/Tomsk", 113, 2, 2549, 30, "MSK+04 - Tomsk");
      c.timezone("Asia/Novokuznetsk", 215, 4, 5227, 60, "MSK+04 - Kemerovo");
      c.timezone("Asia/Krasnoyarsk", 3361, 60, 557, 6, "MSK+04 - Krasnoyarsk area");
      c.timezone("Asia/Irkutsk", 784, 15, 313, 3, "MSK+05 - Irkutsk, Buryatia");
      c.timezone("Asia/Chita", 1041, 20, 1702, 15, "MSK+06 - Zabaykalsky");
      c.timezone("Asia/Yakutsk", 62, 1, 389, 3, "MSK+06 - Lena River");
      c.timezone("Asia/Khandyga", 225563, 3600, 243997, 1800, "MSK+06 - Tomponsky, Ust-Maysky");
      c.timezone("Asia/Vladivostok", 259, 6, 1979, 15, "MSK+07 - Amur River");
      c.timezone("Asia/Ust-Nera", 232417, 3600, 10742, 75, "MSK+07 - Oymyakonsky");
      c.timezone("Asia/Magadan", 1787, 30, 754, 5, "MSK+08 - Magadan");
      c.timezone("Asia/Sakhalin", 1409, 30, 1427, 10, "MSK+08 - Sakhalin Island");
      c.timezone("Asia/Srednekolymsk", 1012, 15, 9223, 60, "MSK+08 - Sakha (E); North Kuril Is");
      c.timezone("Asia/Kamchatka", 3181, 60, 3173, 20, "MSK+09 - Kamchatka");
      c.timezone("Asia/Anadyr", 259, 4, 10649, 60, "MSK+09 - Bering Sea");
    });
    i.country("RW", "Rwanda", (c) => {
      c.timezone("t4");
    });
    i.country("SA", "Saudi Arabia", (c) => {
      c.timezone("t12");
    });
    i.country("SB", "Solomon Islands", (c) => {
      c.timezone("Pacific/Guadalcanal", -143, 15, 801, 5);
    });
    i.country("SC", "Seychelles", (c) => {
      c.timezone("Indian/Mahe", -14, 3, 832, 15);
    });
    i.country("SD", "Sudan", (c) => {
      c.timezone("t3");
    });
    i.country("SE", "Sweden", (c) => {
      c.timezone("Europe/Stockholm", 178, 3, 361, 20);
    });
    i.country("SG", "Singapore", (c) => {
      c.timezone("Asia/Singapore", 77, 60, 2077, 20);
    });
    i.country("SH", "St Helena", (c) => {
      c.timezone("t1");
    });
    i.country("SI", "Slovenia", (c) => {
      c.timezone("t13");
    });
    i.country("SJ", "Svalbard & Jan Mayen", (c) => {
      c.timezone("t16");
    });
    i.country("SK", "Slovakia", (c) => {
      c.timezone("t17");
    });
    i.country("SL", "Sierra Leone", (c) => {
      c.timezone("t1");
    });
    i.country("SM", "San Marino", (c) => {
      c.timezone("t18");
    });
    i.country("SN", "Senegal", (c) => {
      c.timezone("t1");
    });
    i.country("SO", "Somalia", (c) => {
      c.timezone("t5");
    });
    i.country("SR", "Suriname", (c) => {
      c.timezone("America/Paramaribo", 35, 6, -331, 6);
    });
    i.country("SS", "South Sudan", (c) => {
      c.timezone("Africa/Juba", 97, 20, 1897, 60);
    });
    i.country("ST", "Sao Tome & Principe", (c) => {
      c.timezone("Africa/Sao_Tome", 1, 3, 101, 15);
    });
    i.country("SV", "El Salvador", (c) => {
      c.timezone("America/El_Salvador", 137, 10, -446, 5);
    });
    i.country("SX", "St Maarten (Dutch)", (c) => {
      c.timezone("t6");
    });
    i.country("SY", "Syria", (c) => {
      c.timezone("Asia/Damascus", 67, 2, 363, 10);
    });
    i.country("SZ", "Eswatini (Swaziland)", (c) => {
      c.timezone("t2");
    });
    i.country("TC", "Turks & Caicos Is", (c) => {
      c.timezone("America/Grand_Turk", 322, 15, -1067, 15);
    });
    i.country("TD", "Chad", (c) => {
      c.timezone("Africa/Ndjamena", 727, 60, 301, 20);
    });
    i.country("TF", "French Southern & Antarctic Lands", (c) => {
      c.timezone(
        "Indian/Kerguelen",
        -17767,
        360,
        28087,
        400,
        "Kerguelen, St Paul Island, Amsterdam Island",
      );
      c.timezone("t20");
    });
    i.country("TG", "Togo", (c) => {
      c.timezone("t1");
    });
    i.country("TH", "Thailand", (c) => {
      c.timezone("t9");
    });
    i.country("TJ", "Tajikistan", (c) => {
      c.timezone("Asia/Dushanbe", 463, 12, 344, 5);
    });
    i.country("TK", "Tokelau", (c) => {
      c.timezone("Pacific/Fakaofo", -281, 30, -5137, 30);
    });
    i.country("TL", "East Timor", (c) => {
      c.timezone("Asia/Dili", -171, 20, 1507, 12);
    });
    i.country("TM", "Turkmenistan", (c) => {
      c.timezone("Asia/Ashgabat", 759, 20, 3503, 60);
    });
    i.country("TN", "Tunisia", (c) => {
      c.timezone("Africa/Tunis", 184, 5, 611, 60);
    });
    i.country("TO", "Tonga", (c) => {
      c.timezone("Pacific/Tongatapu", -127, 6, -1051, 6);
    });
    i.country("TR", "Turkey", (c) => {
      c.timezone("Europe/Istanbul", 2461, 60, 869, 30);
    });
    i.country("TT", "Trinidad & Tobago", (c) => {
      c.timezone("t8");
    });
    i.country("TV", "Tuvalu", (c) => {
      c.timezone("Pacific/Funafuti", -511, 60, 10753, 60);
    });
    i.country("TW", "Taiwan", (c) => {
      c.timezone("Asia/Taipei", 501, 20, 243, 2);
    });
    i.country("TZ", "Tanzania", (c) => {
      c.timezone("t5");
    });
    i.country("UA", "Ukraine", (c) => {
      c.timezone("Europe/Kiev", 1513, 30, 1831, 60, "Ukraine (most areas)");
      c.timezone("Europe/Uzhgorod", 2917, 60, 223, 10, "Transcarpathia");
      c.timezone("Europe/Zaporozhye", 287, 6, 211, 6, "Zaporozhye and east Lugansk");
      c.timezone("Europe/Simferopol", 899, 20, 341, 10, "Crimea");
    });
    i.country("UG", "Uganda", (c) => {
      c.timezone("t5");
    });
    i.country("UM", "US minor outlying islands", (c) => {
      c.timezone("Pacific/Wake", 1157, 60, 9997, 60, "Wake Island");
      c.timezone("t24");
      c.timezone("t23");
    });
    i.country("US", "United States", (c) => {
      c.timezone("America/New_York", 48857, 1200, -266423, 3600, "Eastern (most areas)");
      c.timezone("America/Detroit", 152393, 3600, -19931, 240, "Eastern - MI (most areas)");
      c.timezone(
        "America/Kentucky/Louisville",
        9181,
        240,
        -154367,
        1800,
        "Eastern - KY (Louisville area)",
      );
      c.timezone(
        "America/Kentucky/Monticello",
        132587,
        3600,
        -101819,
        1200,
        "Eastern - KY (Wayne)",
      );
      c.timezone(
        "America/Indiana/Indianapolis",
        23861,
        600,
        -310169,
        3600,
        "Eastern - IN (most areas)",
      );
      c.timezone(
        "America/Indiana/Vincennes",
        69619,
        1800,
        -315103,
        3600,
        "Eastern - IN (Da, Du, K, Mn)",
      );
      c.timezone("America/Indiana/Winamac", 29557, 720, -311771, 3600, "Eastern - IN (Pulaski)");
      c.timezone("America/Indiana/Marengo", 17269, 450, -310841, 3600, "Eastern - IN (Crawford)");
      c.timezone("America/Indiana/Petersburg", 138571, 3600, -314203, 3600, "Eastern - IN (Pike)");
      c.timezone("America/Indiana/Vevay", 34873, 900, -153121, 1800, "Eastern - IN (Switzerland)");
      c.timezone("America/Chicago", 837, 20, -1753, 20, "Central (most areas)");
      c.timezone("America/Indiana/Tell_City", 136631, 3600, -312341, 3600, "Central - IN (Perry)");
      c.timezone("America/Indiana/Knox", 9911, 240, -693, 8, "Central - IN (Starke)");
      c.timezone("America/Menominee", 40597, 900, -105137, 1200, "Central - MI (Wisconsin border)");
      c.timezone(
        "America/North_Dakota/Center",
        169619,
        3600,
        -121559,
        1200,
        "Central - ND (Oliver)",
      );
      c.timezone(
        "America/North_Dakota/New_Salem",
        9369,
        200,
        -121693,
        1200,
        "Central - ND (Morton rural)",
      );
      c.timezone("America/North_Dakota/Beulah", 56717, 1200, -916, 9, "Central - ND (Mercer)");
      c.timezone("America/Denver", 47687, 1200, -125981, 1200, "Mountain (most areas)");
      c.timezone("America/Boise", 157009, 3600, -46481, 400, "Mountain - ID (south); OR (east)");
      c.timezone("America/Phoenix", 20069, 600, -16811, 150, "MST - Arizona (except Navajo)");
      c.timezone("America/Los_Angeles", 30647, 900, -212837, 1800, "Pacific");
      c.timezone("America/Anchorage", 44077, 720, -539641, 3600, "Alaska (most areas)");
      c.timezone("America/Juneau", 209887, 3600, -483911, 3600, "Alaska - Juneau area");
      c.timezone("America/Sitka", 41167, 720, -487087, 3600, "Alaska - Sitka area");
      c.timezone("America/Metlakatla", 198457, 3600, -18947, 144, "Alaska - Annette Island");
      c.timezone("America/Yakutat", 214369, 3600, -251509, 1800, "Alaska - Yakutat");
      c.timezone("America/Nome", 58051, 900, -595463, 3600, "Alaska (west)");
      c.timezone("America/Adak", 1297, 25, -635969, 3600, "Aleutian Islands");
      c.timezone("t23");
    });
    i.country("UY", "Uruguay", (c) => {
      c.timezone("America/Montevideo", -41891, 1200, -4497, 80);
    });
    i.country("UZ", "Uzbekistan", (c) => {
      c.timezone("Asia/Samarkand", 119, 3, 334, 5, "Uzbekistan (west)");
      c.timezone("Asia/Tashkent", 124, 3, 693, 10, "Uzbekistan (east)");
    });
    i.country("VA", "Vatican City", (c) => {
      c.timezone("t18");
    });
    i.country("VC", "St Vincent", (c) => {
      c.timezone("t8");
    });
    i.country("VE", "Venezuela", (c) => {
      c.timezone("America/Caracas", 21, 2, -1004, 15);
    });
    i.country("VG", "Virgin Islands (UK)", (c) => {
      c.timezone("t8");
    });
    i.country("VI", "Virgin Islands (US)", (c) => {
      c.timezone("t8");
    });
    i.country("VN", "Vietnam", (c) => {
      c.timezone("Asia/Ho_Chi_Minh", 43, 4, 320, 3, "Vietnam (south)");
      c.timezone("t9");
    });
    i.country("VU", "Vanuatu", (c) => {
      c.timezone("Pacific/Efate", -53, 3, 2021, 12);
    });
    i.country("WF", "Wallis & Futuna", (c) => {
      c.timezone("Pacific/Wallis", -133, 10, -1057, 6);
    });
    i.country("WS", "Samoa (western)", (c) => {
      c.timezone("Pacific/Apia", -83, 6, -2576, 15);
    });
    i.country("YE", "Yemen", (c) => {
      c.timezone("t12");
    });
    i.country("YT", "Mayotte", (c) => {
      c.timezone("t5");
    });
    i.country("ZA", "South Africa", (c) => {
      c.timezone("t2");
    });
    i.country("ZM", "Zambia", (c) => {
      c.timezone("t4");
    });
    i.country("ZW", "Zimbabwe", (c) => {
      c.timezone("t4");
    });
  },
);
