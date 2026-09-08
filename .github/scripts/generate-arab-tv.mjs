import fs from "node:fs/promises";

const API = "https://iptv-org.github.io/api";

const FREE_TV_URL =
  "https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8";

const ARABIC_EXTRA_URL =
  "https://live.hacks.tools/iptv/languages/ara.m3u";

/* =========================================================
 * Load data
 * ========================================================= */

const [
  channels,
  streams,
  feeds,
  regions,
  logos,
  freeTvText,
  arabicExtraText
] = await Promise.all([
  fetchJson(`${API}/channels.json`),
  fetchJson(`${API}/streams.json`),
  fetchJson(`${API}/feeds.json`),
  fetchJson(`${API}/regions.json`),
  fetchJson(`${API}/logos.json`),
  fetchText(FREE_TV_URL),
  fetchText(ARABIC_EXTRA_URL)
]);

async function fetchJson(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Failed to fetch ${url}: ${response.status}`
    );
  }

  return response.json();
}

async function fetchText(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Failed to fetch ${url}: ${response.status}`
    );
  }

  return response.text();
}

/* =========================================================
 * Helpers
 * ========================================================= */

function normalizeName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function includesKeyword(text, keywords) {
  const normalized = normalizeName(text);

  return keywords.some(keyword =>
    normalized.includes(normalizeName(keyword))
  );
}

/* =========================================================
 * Arab countries ONLY
 * ========================================================= */

const arabRegion = regions.find(
  region =>
    region.code?.toUpperCase() === "ARAB"
);

if (!arabRegion) {
  throw new Error(
    "ARAB region was not found."
  );
}

const arabCountries =
  new Set(arabRegion.countries);

const allowedArabCountries = new Set([
  "AE",
  "BH",
  "DJ",
  "DZ",
  "EG",
  "IQ",
  "JO",
  "KM",
  "KW",
  "LB",
  "LY",
  "MA",
  "MR",
  "OM",
  "PS",
  "QA",
  "SA",
  "SD",
  "SO",
  "SY",
  "TN",
  "YE"
]);

/* =========================================================
 * Allowed languages
 *
 * Arabic + English allowed.
 * We DON'T strictly reject channels that also have
 * another language such as Hindi.
 * ========================================================= */

const allowedLanguages = new Set([
  "ar",
  "ara",
  "arb",
  "arabic",

  "en",
  "eng",
  "english"
]);

function normalizeLanguage(language) {
  return String(language || "")
    .trim()
    .toLowerCase();
}

/* =========================================================
 * Categories we want from IPTV-org
 * ========================================================= */

const sourceCategories = new Set([
  "series",
  "sports",
  "kids",
  "movies",
  "religious",
  "comedy",
  "family",
  "entertainment",
  "culture"
]);

/* =========================================================
 * Lookup maps
 * ========================================================= */

const feedMap = new Map(
  feeds.map(feed => [
    `${feed.channel}@${feed.id}`,
    feed
  ])
);

const logoMap = new Map();

for (const logo of logos) {
  if (!logo.in_use) continue;

  if (!logoMap.has(logo.channel)) {
    logoMap.set(
      logo.channel,
      logo.url
    );
  }
}

const streamsByChannel = new Map();

for (const stream of streams) {
  if (
    !stream.channel ||
    !stream.url
  ) {
    continue;
  }

  if (
    !streamsByChannel.has(
      stream.channel
    )
  ) {
    streamsByChannel.set(
      stream.channel,
      []
    );
  }

  streamsByChannel
    .get(stream.channel)
    .push(stream);
}

/* =========================================================
 * Country names
 * ========================================================= */

const countryNames = {
  DZ: "Algeria",
  BH: "Bahrain",
  KM: "Comoros",
  DJ: "Djibouti",
  EG: "Egypt",
  IQ: "Iraq",
  JO: "Jordan",
  KW: "Kuwait",
  LB: "Lebanon",
  LY: "Libya",
  MR: "Mauritania",
  MA: "Morocco",
  OM: "Oman",
  PS: "Palestine",
  QA: "Qatar",
  SA: "Saudi Arabia",
  SO: "Somalia",
  SD: "Sudan",
  SY: "Syria",
  TN: "Tunisia",
  AE: "United Arab Emirates",
  YE: "Yemen"
};

function countryName(code) {
  return countryNames[code] || code;
}

/* =========================================================
 * Adult / XXX filter
 * ========================================================= */

const adultKeywords = [
  "xxx",
  "adult",
  "adults only",
  "18+",
  "18 plus",
  "porn",
  "porno",
  "pornography",
  "erotic",
  "erotica",
  "sex",
  "sexy",
  "playboy",
  "penthouse",
  "hustler",

  "اباحي",
  "إباحي",
  "اباحية",
  "إباحية",
  "للكبار",
  "للبالغين",
  "جنسي",
  "جنسية"
];

function isAdultChannel(channel) {
  if (channel.is_nsfw) {
    return true;
  }

  const categories =
    channel.categories || [];

  if (
    categories.includes("xxx")
  ) {
    return true;
  }

  const text = `
    ${channel.id || ""}
    ${channel.name || ""}
    ${channel.alt_names?.join(" ") || ""}
  `;

  return includesKeyword(
    text,
    adultKeywords
  );
}

/* =========================================================
 * Coptic filter
 * ========================================================= */

const copticKeywords = [
  "coptic",
  "copts",
  "aghapy",
  "aghapi",
  "coptic tv",
  "ctv coptic",
  "coptic orthodox",

  "قبطي",
  "قبطية",
  "القبطية",
  "الأقباط"
];

function isCopticChannel(channel) {
  const text = `
    ${channel.id || ""}
    ${channel.name || ""}
    ${channel.alt_names?.join(" ") || ""}
  `;

  return includesKeyword(
    text,
    copticKeywords
  );
}

/* =========================================================
 * Language detection
 * ========================================================= */

function getChannelLanguages(channel) {
  const detected = new Set();

  for (
    const language
    of channel.languages || []
  ) {
    detected.add(
      normalizeLanguage(language)
    );
  }

  const channelStreams =
    streamsByChannel.get(
      channel.id
    ) || [];

  for (
    const stream
    of channelStreams
  ) {
    if (!stream.feed) {
      continue;
    }

    const feed =
      feedMap.get(
        `${stream.channel}@${stream.feed}`
      );

    if (!feed) {
      continue;
    }

    for (
      const language
      of feed.languages || []
    ) {
      detected.add(
        normalizeLanguage(language)
      );
    }
  }

  return [...detected]
    .filter(Boolean);
}

function isAllowedLanguage(channel) {
  const languages =
    getChannelLanguages(channel);

  /*
   * No metadata:
   * keep channel rather than dropping it.
   */
  if (!languages.length) {
    return true;
  }

  /*
   * At least Arabic or English.
   *
   * Example:
   * Arabic + Hindi = allowed
   * English + Hindi = allowed
   * Hindi only = rejected
   */
  return languages.some(language =>
    allowedLanguages.has(language)
  );
}

/* =========================================================
 * Classification keywords
 * ========================================================= */

const theaterKeywords = [
  "theater",
  "theatre",
  "theatrical",
  "plays",
  "stage play",
  "stage plays",
  "live theater",
  "live theatre",
  "performing arts",

  "masrah",
  "masra7",
  "masrahiyat",
  "masrahyat",
  "masrahiya",
  "masra7iyat",

  "مسرح",
  "المسرح",
  "مسرحية",
  "مسرحيات",
  "المسرحيات",
  "عرض مسرحي",
  "عروض مسرحية",
  "فنون مسرحية"
];

const theaterRelatedKeywords = [
  "comedy theater",
  "comedy theatre",
  "musical theater",
  "musical theatre",
  "stage comedy",
  "classic plays",

  "مسرح كوميدي",
  "مسرحيات كوميدية",
  "مسرحيات مصرية",
  "مسرحيات عربية",
  "مسرحيات قديمة",
  "مسرحيات كلاسيكية"
];

const comedyKeywords = [
  "comedy",
  "comedies",
  "comic",
  "funny",
  "laugh",

  "ضحك",
  "كوميدي",
  "كوميديا",
  "كوميدى"
];

const familyKeywords = [
  "family",
  "families",
  "family tv",
  "family channel",

  "عائلة",
  "العائلة",
  "عائلي",
  "عائلية",
  "عائلى"
];

const sportsKeywords = [
  "sport",
  "sports",
  "football",
  "soccer",
  "basketball",
  "tennis",
  "racing",
  "match",

  "رياضة",
  "رياضي",
  "رياضية",
  "كرة",
  "مباريات"
];

const quranKeywords = [
  "quran",
  "qur'an",
  "koran",
  "holy quran",
  "quran kareem",

  "قرآن",
  "القرآن"
];

/* =========================================================
 * Playlist category
 * ========================================================= */

function getPlaylistCategory(channel) {
  const channelCategories =
    channel.categories || [];

  const name =
    channel.name || "";

  /*
   * 1. Quran
   */
  if (
    channelCategories.includes(
      "religious"
    ) &&
    ["EG", "SA"].includes(
      channel.country
    ) &&
    includesKeyword(
      name,
      quranKeywords
    )
  ) {
    return "Quran";
  }

  /*
   * 2. Theater
   *
   * Higher priority than Comedy / Series.
   */
  if (
    includesKeyword(
      name,
      [
        ...theaterKeywords,
        ...theaterRelatedKeywords
      ]
    ) ||
    (
      channelCategories.includes("culture") &&
      includesKeyword(
        name,
        [
          "stage",
          "plays",
          "theater",
          "theatre",
          "مسرح"
        ]
      )
    ) ||
    (
      channelCategories.includes("entertainment") &&
      includesKeyword(
        name,
        [
          "plays",
          "theater",
          "theatre",
          "masrah",
          "مسرح",
          "مسرحيات"
        ]
      )
    )
  ) {
    return "Theater";
  }

  /*
   * 3. Comedy
   */
  if (
    channelCategories.includes(
      "comedy"
    ) ||
    includesKeyword(
      name,
      comedyKeywords
    )
  ) {
    return "Comedy";
  }

  /*
   * 4. Sports
   */
  if (
    channelCategories.includes(
      "sports"
    ) ||
    includesKeyword(
      name,
      sportsKeywords
    )
  ) {
    return "Sports";
  }

  /*
   * 5. Kids
   */
  if (
    channelCategories.includes(
      "kids"
    )
  ) {
    return "Kids";
  }

  /*
   * 6. Family
   */
  if (
    channelCategories.includes(
      "family"
    ) ||
    includesKeyword(
      name,
      familyKeywords
    )
  ) {
    return "Family";
  }

  /*
   * 7. Series
   */
  if (
    channelCategories.includes(
      "series"
    ) ||
    normalizeName(name).includes(
      "drama"
    ) ||
    normalizeName(name).includes(
      "دراما"
    )
  ) {
    return "Series";
  }

  /*
   * 8. Movies
   */
  if (
    channelCategories.includes(
      "movies"
    )
  ) {
    const foreignKeywords = [
      "hollywood",
      "bollywood",
      "action",
      "thriller",
      "english",
      "hindi",
      "osn movies"
    ];

    if (
      includesKeyword(
        name,
        foreignKeywords
      )
    ) {
      return "Foreign Movies";
    }

    const arabicMovieKeywords = [
      "rotana cinema",
      "aflam",
      "cinema masr",
      "arabic",
      "masr",

      "افلام",
      "أفلام",
      "سينما"
    ];

    if (
      includesKeyword(
        name,
        arabicMovieKeywords
      )
    ) {
      return "Arabic Movies";
    }

    const languages =
      getChannelLanguages(
        channel
      );

    if (
      languages.some(language =>
        [
          "ar",
          "ara",
          "arb",
          "arabic"
        ].includes(language)
      )
    ) {
      return "Arabic Movies";
    }

    return "Foreign Movies";
  }

  return null;
}

/* =========================================================
 * Stream scoring
 *
 * IMPORTANT:
 * No codec filtering.
 *
 * ffprobe compatibility remains separate.
 * ========================================================= */

function scoreStream(stream) {
  let score = 0;

  const text =
    `${
      stream.title || ""
    } ${
      stream.label || ""
    }`.toLowerCase();

  if (
    text.includes("offline")
  ) {
    score -= 1000;
  }

  if (
    text.includes("geo-blocked")
  ) {
    score -= 50;
  }

  if (
    stream.url?.includes(
      ".m3u8"
    )
  ) {
    score += 40;
  }

  if (!stream.referrer) {
    score += 15;
  }

  if (!stream.user_agent) {
    score += 10;
  }

  if (stream.quality) {
    const match =
      stream.quality.match(
        /(\d{3,4})p/i
      );

    if (match) {
      const quality =
        Number(match[1]);

      if (quality === 720) {
        score += 40;
      } else if (
        quality === 1080
      ) {
        score += 35;
      } else if (
        quality === 576
      ) {
        score += 25;
      } else if (
        quality === 480
      ) {
        score += 20;
      } else if (
        quality > 1080
      ) {
        score -= 10;
      }
    }
  }

  return score;
}

function selectBestStream(
  channel
) {
  const available =
    streamsByChannel.get(
      channel.id
    ) || [];

  if (!available.length) {
    return null;
  }

  return [...available].sort(
    (a, b) =>
      scoreStream(b) -
      scoreStream(a)
  )[0];
}

/* =========================================================
 * IPTV-org selection
 * ========================================================= */

const selected = [];

for (const channel of channels) {

  /*
   * Arab countries ONLY
   */
  if (
    !arabCountries.has(
      channel.country
    ) ||
    !allowedArabCountries.has(
      channel.country
    )
  ) {
    continue;
  }

  /*
   * Adult / XXX
   */
  if (
    isAdultChannel(channel)
  ) {
    continue;
  }

  /*
   * Coptic
   */
  if (
    isCopticChannel(channel)
  ) {
    continue;
  }

  /*
   * Arabic / English
   * Hindi can coexist with Arabic/English.
   */
  if (
    !isAllowedLanguage(channel)
  ) {
    continue;
  }

  const isEgypt =
    channel.country === "EG";

  const isWantedCategory =
    channel.categories?.some(
      category =>
        sourceCategories.has(
          category
        )
    );

  /*
   * Egypt remains broad
   */
  if (
    !isEgypt &&
    !isWantedCategory
  ) {
    continue;
  }

  let category =
    getPlaylistCategory(
      channel
    );

  /*
   * Egypt general/news fallback
   */
  if (
    !category &&
    channel.country === "EG"
  ) {
    category = "Egypt TV";
  }

  if (!category) {
    continue;
  }

  const stream =
    selectBestStream(channel);

  if (!stream) {
    continue;
  }

  selected.push({
    channel,
    stream,
    category,
    source: "IPTV-org"
  });
}

/* =========================================================
 * Generic M3U parser
 * ========================================================= */

function parseM3U(text) {
  const lines =
    text.split(/\r?\n/);

  const result = [];

  for (
    let i = 0;
    i < lines.length;
    i++
  ) {
    const line =
      lines[i].trim();

    if (
      !line.startsWith(
        "#EXTINF"
      )
    ) {
      continue;
    }

    let url = "";

    for (
      let j = i + 1;
      j < lines.length;
      j++
    ) {
      const next =
        lines[j].trim();

      if (!next) {
        continue;
      }

      if (
        !next.startsWith("#")
      ) {
        url = next;
        break;
      }
    }

    if (!url) {
      continue;
    }

    const name =
      line.includes(",")
        ? line.substring(
            line.lastIndexOf(",") + 1
          ).trim()
        : "Unknown";

    const groupMatch =
      line.match(
        /group-title="([^"]*)"/i
      );

    const idMatch =
      line.match(
        /tvg-id="([^"]*)"/i
      );

    const logoMatch =
      line.match(
        /tvg-logo="([^"]*)"/i
      );

    const countryMatch =
      line.match(
        /tvg-country="([^"]*)"/i
      );

    const languageMatch =
      line.match(
        /tvg-language="([^"]*)"/i
      );

    result.push({
      name,
      url,
      raw: line,

      group:
        groupMatch?.[1] || "",

      tvgId:
        idMatch?.[1] || "",

      logo:
        logoMatch?.[1] || "",

      country:
        countryMatch?.[1]
          ?.toUpperCase() || "",

      language:
        languageMatch?.[1] || ""
    });
  }

  return result;
}

const freeTvChannels =
  parseM3U(freeTvText);

const arabicExtraChannels =
  parseM3U(arabicExtraText);

/* =========================================================
 * External country detection
 * ========================================================= */

function inferCountryFromTvgId(
  tvgId
) {
  if (!tvgId) {
    return null;
  }

  /*
   * Handles:
   *
   * Channel.eg
   * Channel.eg@SD
   * Channel.sa@HD
   */
  const cleanId =
    tvgId
      .split("@")[0]
      .trim();

  const match =
    cleanId.match(
      /\.([a-z]{2})$/i
    );

  if (!match) {
    return null;
  }

  return match[1]
    .toUpperCase();
}

function getExternalChannelCountry(
  item
) {
  /*
   * Explicit country first
   */
  if (
    item.country &&
    allowedArabCountries.has(
      item.country
    )
  ) {
    return item.country;
  }

  /*
   * Otherwise infer from tvg-id
   */
  const inferred =
    inferCountryFromTvgId(
      item.tvgId
    );

  if (
    inferred &&
    allowedArabCountries.has(
      inferred
    )
  ) {
    return inferred;
  }

  return null;
}

/* =========================================================
 * External source filters
 * ========================================================= */

function isAdultExternalChannel(
  item
) {
  const text = `
    ${item.name || ""}
    ${item.group || ""}
    ${item.tvgId || ""}
  `;

  return includesKeyword(
    text,
    adultKeywords
  );
}

function isCopticExternalChannel(
  item
) {
  const text = `
    ${item.name || ""}
    ${item.group || ""}
    ${item.tvgId || ""}
  `;

  return includesKeyword(
    text,
    copticKeywords
  );
}

function isTheaterExternalChannel(
  item
) {
  const text = `
    ${item.name || ""}
    ${item.group || ""}
    ${item.tvgId || ""}
  `;

  return includesKeyword(
    text,
    [
      ...theaterKeywords,
      ...theaterRelatedKeywords
    ]
  );
}

/* =========================================================
 * Egypt enrichment
 * ========================================================= */

const egyptWanted = [
  "mbc masr",
  "mbc masr 1",
  "mbc masr 2",
  "mbc 1 egypt",

  "alhayat",
  "al hayat",

  "al qahera news",
  "cairo news",

  "cbc",
  "cbc drama",
  "cbc sofra",

  "dmc",
  "dmc drama",

  "on",
  "on drama",

  "al nahar",
  "al nahar drama",

  "sada el balad",
  "sada el balad drama",

  "rotana cinema",
  "mix hollywood",

  "koogi",

  "al masriyah",
  "watan tv",

  "comedy",
  "family",

  "theater",
  "theatre",
  "plays",
  "stage",
  "masrah",
  "masrahiyat",
  "masrahyat",
  "مسرح",
  "مسرحيات",
  "مسرحية",

  "sports"
];

function isWantedEgyptChannel(
  name
) {
  const normalized =
    normalizeName(name);

  return egyptWanted.some(
    wanted =>
      normalized.includes(
        normalizeName(wanted)
      )
  );
}

function classifyEgyptChannel(
  name
) {
  const n =
    normalizeName(name);

  /*
   * Theater
   */
  if (
    includesKeyword(
      n,
      [
        ...theaterKeywords,
        ...theaterRelatedKeywords
      ]
    )
  ) {
    return "Theater";
  }

  /*
   * Comedy
   */
  if (
    includesKeyword(
      n,
      comedyKeywords
    )
  ) {
    return "Comedy";
  }

  /*
   * Sports
   */
  if (
    includesKeyword(
      n,
      sportsKeywords
    )
  ) {
    return "Sports";
  }

  /*
   * Kids
   */
  if (
    n.includes("koogi") ||
    n.includes("kids") ||
    n.includes("أطفال")
  ) {
    return "Kids";
  }

  /*
   * Family
   */
  if (
    includesKeyword(
      n,
      familyKeywords
    )
  ) {
    return "Family";
  }

  /*
   * Series / Drama
   */
  if (
    n.includes("drama") ||
    n.includes("دراما") ||
    n.includes("مسلسلات")
  ) {
    return "Series";
  }

  /*
   * Foreign movies
   */
  if (
    includesKeyword(
      n,
      [
        "hollywood",
        "action",
        "thriller",
        "bollywood"
      ]
    )
  ) {
    return "Foreign Movies";
  }

  /*
   * Arabic movies
   */
  if (
    includesKeyword(
      n,
      [
        "rotana cinema",
        "cinema",
        "aflam",
        "سينما",
        "افلام",
        "أفلام"
      ]
    )
  ) {
    return "Arabic Movies";
  }

  return "Egypt TV";
}

/* =========================================================
 * Dedupe helpers
 * ========================================================= */

function channelKey(name) {
  return normalizeName(name)
    .replace(/\bhd\b/g, "")
    .replace(/\bsd\b/g, "")
    .replace(/\bfhd\b/g, "")
    .replace(/\b4k\b/g, "")
    .replace(/\b1080p\b/g, "")
    .replace(/\b720p\b/g, "")
    .replace(/\b576p\b/g, "")
    .replace(/\b480p\b/g, "")
    .trim();
}

function streamKey(url) {
  return String(url || "")
    .trim()
    .toLowerCase();
}

const existingNames =
  new Set(
    selected.map(item =>
      channelKey(
        item.channel.name
      )
    )
  );

const existingStreams =
  new Set(
    selected.map(item =>
      streamKey(
        item.stream.url
      )
    )
  );

/* =========================================================
 * Add Egypt channels from Free-TV
 * ========================================================= */

for (
  const item
  of freeTvChannels
) {
  const group =
    normalizeName(item.group);

  /*
   * Free-TV enrichment = Egypt only
   */
  const isEgypt =
    group === "egypt" ||
    group.includes("egypt");

  if (!isEgypt) {
    continue;
  }

  if (
    isAdultExternalChannel(item)
  ) {
    continue;
  }

  if (
    isCopticExternalChannel(item)
  ) {
    continue;
  }

  if (
    !isWantedEgyptChannel(
      item.name
    )
  ) {
    continue;
  }

  const key =
    channelKey(item.name);

  const urlKey =
    streamKey(item.url);

  if (
    existingNames.has(key) ||
    existingStreams.has(urlKey)
  ) {
    continue;
  }

  existingNames.add(key);
  existingStreams.add(urlKey);

  selected.push({
    channel: {
      id:
        item.tvgId ||
        `FreeTV.${key
          .replace(
            /\s+/g,
            ""
          )}.eg`,

      name:
        item.name,

      country:
        "EG"
    },

    stream: {
      url:
        item.url
    },

    category:
      classifyEgyptChannel(
        item.name
      ),

    logo:
      item.logo,

    source:
      "Free-TV"
  });
}

/* =========================================================
 * Extra Arabic source
 *
 * Theater channels ONLY
 * ========================================================= */

let extraTheaterAdded = 0;

for (
  const item
  of arabicExtraChannels
) {

  /*
   * Arab countries only
   */
  const country =
    getExternalChannelCountry(
      item
    );

  if (!country) {
    continue;
  }

  /*
   * Adult filter
   */
  if (
    isAdultExternalChannel(
      item
    )
  ) {
    continue;
  }

  /*
   * Coptic filter
   */
  if (
    isCopticExternalChannel(
      item
    )
  ) {
    continue;
  }

  /*
   * Extra source is ONLY used
   * for Theater discovery.
   */
  if (
    !isTheaterExternalChannel(
      item
    )
  ) {
    continue;
  }

  /*
   * HTTP / HTTPS streams only
   */
  if (
    !item.url ||
    !/^https?:\/\//i.test(
      item.url
    )
  ) {
    continue;
  }

  const nameKey =
    channelKey(item.name);

  const urlKey =
    streamKey(item.url);

  /*
   * Dedupe name and URL
   */
  if (
    existingNames.has(nameKey) ||
    existingStreams.has(urlKey)
  ) {
    continue;
  }

  existingNames.add(nameKey);
  existingStreams.add(urlKey);

  selected.push({
    channel: {
      id:
        item.tvgId ||
        `ArabicExtra.${country}.${nameKey
          .replace(
            /\s+/g,
            ""
          )}`,

      name:
        item.name,

      country
    },

    stream: {
      url:
        item.url
    },

    category:
      "Theater",

    logo:
      item.logo,

    source:
      "Arabic-Extra"
  });

  extraTheaterAdded++;
}

/* =========================================================
 * Final safety filtering
 * ========================================================= */

const finalSelected =
  selected.filter(item => {

    /*
     * Arab countries ONLY
     */
    if (
      !allowedArabCountries.has(
        item.channel.country
      )
    ) {
      return false;
    }

    /*
     * Adult safety
     */
    if (
      isAdultChannel(
        item.channel
      )
    ) {
      return false;
    }

    /*
     * Coptic safety
     */
    if (
      isCopticChannel(
        item.channel
      )
    ) {
      return false;
    }

    return true;
  });

/* =========================================================
 * Sorting
 * ========================================================= */

const categoryOrder = {
  Quran: 1,
  Kids: 2,
  Family: 3,
  Comedy: 4,
  Theater: 5,
  Series: 6,
  "Arabic Movies": 7,
  "Foreign Movies": 8,
  Sports: 9,
  "Egypt TV": 10
};

finalSelected.sort(
  (a, b) => {

    const countryA =
      countryName(
        a.channel.country
      );

    const countryB =
      countryName(
        b.channel.country
      );

    if (
      countryA !== countryB
    ) {
      return countryA.localeCompare(
        countryB
      );
    }

    const orderA =
      categoryOrder[
        a.category
      ] ?? 99;

    const orderB =
      categoryOrder[
        b.category
      ] ?? 99;

    if (
      orderA !== orderB
    ) {
      return orderA -
        orderB;
    }

    return (
      a.channel.name || ""
    ).localeCompare(
      b.channel.name || ""
    );
  }
);

/* =========================================================
 * Generate M3U
 * ========================================================= */

const output = [];

output.push(
  '#EXTM3U x-tvg-url="https://raw.githubusercontent.com/StrangeDrVN/epg/public/output/guide.xml.gz"'
);

output.push(
  "# Generated automatically from IPTV-org + Free-TV + Arabic Extra"
);

output.push(
  "# Filters: Arab countries + Arabic/English primary + No Adult + No Coptic"
);

output.push(
  `# Generated: ${new Date().toISOString()}`
);

output.push("");

let currentGroup = null;

for (
  const item
  of finalSelected
) {
  const {
    channel,
    stream,
    category
  } = item;

  const country =
    countryName(
      channel.country
    );

  const group =
    `${country} | ${category}`;

  if (
    group !== currentGroup
  ) {
    currentGroup =
      group;

    output.push(
      `# === ${group} ===`
    );
  }

  const logo =
    item.logo ||
    logoMap.get(
      channel.id
    ) ||
    "";

  const name =
    String(
      channel.name || ""
    )
      .replace(
        /\r?\n/g,
        " "
      )
      .trim();

  const safeName =
    name.replace(
      /"/g,
      "'"
    );

  const safeGroup =
    group.replace(
      /"/g,
      "'"
    );

  const attributes = [
    `tvg-id="${channel.id || ""}"`,
    `tvg-name="${safeName}"`,

    logo
      ? `tvg-logo="${logo}"`
      : "",

    `group-title="${safeGroup}"`
  ]
    .filter(Boolean)
    .join(" ");

  output.push(
    `#EXTINF:-1 ${attributes},${name}`
  );

  output.push(
    stream.url
  );

  output.push("");
}

/* =========================================================
 * Write playlist
 * ========================================================= */

await fs.mkdir(
  "playlists",
  {
    recursive: true
  }
);

await fs.writeFile(
  "playlists/arab-tv.m3u",
  output.join("\n"),
  "utf8"
);

/* =========================================================
 * Summary
 * ========================================================= */

console.log("");
console.log(
  `Generated ${finalSelected.length} channels.`
);

console.log("");

const categorySummary = {};

for (
  const item
  of finalSelected
) {
  const key =
    `${countryName(
      item.channel.country
    )} | ${item.category}`;

  categorySummary[key] =
    (categorySummary[key] || 0) +
    1;
}

console.log(
  "================================="
);

console.log(
  "Categories"
);

console.log(
  "================================="
);

console.table(
  categorySummary
);

/* =========================================================
 * Source summary
 * ========================================================= */

const sourceSummary = {};

for (
  const item
  of finalSelected
) {
  const source =
    item.source || "Unknown";

  sourceSummary[source] =
    (sourceSummary[source] || 0) +
    1;
}

console.log("");
console.log(
  "================================="
);

console.log(
  "Sources"
);

console.log(
  "================================="
);

console.table(
  sourceSummary
);

/* =========================================================
 * Filter summary
 * ========================================================= */

console.log("");
console.log(
  "================================="
);

console.log(
  "Playlist filters"
);

console.log(
  "================================="
);

console.log(
  "✅ Arab countries only"
);

console.log(
  "✅ Arabic / English primary languages"
);

console.log(
  "✅ Hindi can coexist where needed"
);

console.log(
  "✅ Adult / XXX blocked"
);

console.log(
  "✅ Coptic channels removed"
);

console.log(
  "✅ Sports category"
);

console.log(
  "✅ Theater category"
);

console.log(
  "✅ Comedy category"
);

console.log(
  "✅ Family category"
);

console.log(
  `✅ Extra Theater channels added: ${extraTheaterAdded}`
);

console.log(
  "================================="
);
