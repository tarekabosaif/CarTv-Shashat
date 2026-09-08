import fs from "node:fs/promises";

/* =========================================================
 * Sources
 * ========================================================= */

const API =
  "https://iptv-org.github.io/api";

const FREE_TV_URL =
  "https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8";

/* =========================================================
 * Fetch helpers
 * ========================================================= */

async function fetchJson(url) {
  const response =
    await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Failed to fetch ${url}: ${response.status}`
    );
  }

  return response.json();
}

async function fetchText(url) {
  const response =
    await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Failed to fetch ${url}: ${response.status}`
    );
  }

  return response.text();
}

/* =========================================================
 * Load sources
 * ========================================================= */

console.log(
  "Loading IPTV-org + Free-TV..."
);

const [
  channels,
  streams,
  feeds,
  regions,
  logos,
  freeTvText
] = await Promise.all([
  fetchJson(
    `${API}/channels.json`
  ),

  fetchJson(
    `${API}/streams.json`
  ),

  fetchJson(
    `${API}/feeds.json`
  ),

  fetchJson(
    `${API}/regions.json`
  ),

  fetchJson(
    `${API}/logos.json`
  ),

  fetchText(
    FREE_TV_URL
  )
]);

console.log(
  "✅ Sources loaded."
);

/* =========================================================
 * Helpers
 * ========================================================= */

function normalizeName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(
      /[^\p{L}\p{N}]+/gu,
      " "
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}

function includesKeyword(
  text,
  keywords
) {
  const normalized =
    normalizeName(text);

  return keywords.some(
    keyword =>
      normalized.includes(
        normalizeName(keyword)
      )
  );
}

/* =========================================================
 * Allowed countries
 *
 * This object is now the SINGLE source of truth.
 *
 * Add/remove a country here and the playlist filter
 * automatically follows it.
 * ========================================================= */

const countryNames = {
  BH: "Bahrain",
  EG: "Egypt",
  JO: "Jordan",
  KW: "Kuwait",
  PS: "Palestine",
  QA: "Qatar",
  SA: "Saudi Arabia",
  SY: "Syria",
  TN: "Tunisia",
  AE: "United Arab Emirates"
};

const allowedArabCountries =
  new Set(
    Object.keys(
      countryNames
    )
  );

function countryName(code) {
  return (
    countryNames[code] ||
    code
  );
}

/* =========================================================
 * Confirm ARAB region exists
 * ========================================================= */

const arabRegion =
  regions.find(
    region =>
      region.code
        ?.toUpperCase() ===
      "ARAB"
  );

if (!arabRegion) {
  throw new Error(
    "ARAB region was not found."
  );
}

const arabRegionCountries =
  new Set(
    arabRegion.countries || []
  );

/* =========================================================
 * Allowed primary languages
 *
 * Arabic and English are preferred.
 *
 * Hindi is NOT globally blocked because channels such as
 * MBC Bollywood / Zee Alwan are intentionally allowed
 * when they belong to our selected Arab countries.
 * ========================================================= */

const allowedLanguages =
  new Set([
    "ar",
    "ara",
    "arb",
    "arabic",

    "en",
    "eng",
    "english",

    /*
     * Explicitly allowed
     */
    "hi",
    "hin",
    "hindi"
  ]);

function normalizeLanguage(
  language
) {
  return String(
    language || ""
  )
    .trim()
    .toLowerCase();
}

/* =========================================================
 * Source categories
 * ========================================================= */

const sourceCategories =
  new Set([
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
 * Feed lookup
 * ========================================================= */

const feedMap =
  new Map(
    feeds.map(
      feed => [
        `${feed.channel}@${feed.id}`,
        feed
      ]
    )
  );

/* =========================================================
 * Logo lookup
 * ========================================================= */

const logoMap =
  new Map();

for (
  const logo
  of logos
) {
  if (!logo.in_use) {
    continue;
  }

  if (
    !logoMap.has(
      logo.channel
    )
  ) {
    logoMap.set(
      logo.channel,
      logo.url
    );
  }
}

/* =========================================================
 * Stream lookup
 * ========================================================= */

const streamsByChannel =
  new Map();

for (
  const stream
  of streams
) {
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
    .get(
      stream.channel
    )
    .push(stream);
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

function isAdultChannel(
  channel
) {
  if (
    channel.is_nsfw
  ) {
    return true;
  }

  const categories =
    channel.categories || [];

  if (
    categories.includes(
      "xxx"
    )
  ) {
    return true;
  }

  const text = `
    ${channel.id || ""}
    ${channel.name || ""}
    ${
      channel.alt_names
        ?.join(" ") || ""
    }
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

function isCopticChannel(
  channel
) {
  const text = `
    ${channel.id || ""}
    ${channel.name || ""}
    ${
      channel.alt_names
        ?.join(" ") || ""
    }
  `;

  return includesKeyword(
    text,
    copticKeywords
  );
}

/* =========================================================
 * Language detection
 * ========================================================= */

function getChannelLanguages(
  channel
) {
  const detected =
    new Set();

  /*
   * Channel languages
   */
  for (
    const language
    of channel.languages || []
  ) {
    detected.add(
      normalizeLanguage(
        language
      )
    );
  }

  /*
   * Feed languages
   */
  const channelStreams =
    streamsByChannel.get(
      channel.id
    ) || [];

  for (
    const stream
    of channelStreams
  ) {
    if (
      !stream.feed
    ) {
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
        normalizeLanguage(
          language
        )
      );
    }
  }

  return [
    ...detected
  ].filter(Boolean);
}

function isAllowedLanguage(
  channel
) {
  const languages =
    getChannelLanguages(
      channel
    );

  /*
   * Missing language metadata:
   * keep the channel.
   */
  if (
    !languages.length
  ) {
    return true;
  }

  /*
   * Accept if Arabic, English or Hindi
   * is among the known languages.
   */
  return languages.some(
    language =>
      allowedLanguages.has(
        language
      )
  );
}

/* =========================================================
 * Category keywords
 * ========================================================= */

/* -------------------------
 * Quran
 * ------------------------- */

const quranKeywords = [
  "quran",
  "qur'an",
  "koran",

  "holy quran",
  "quran kareem",

  "قرآن",
  "القرآن",
  "القرآن الكريم"
];

/* -------------------------
 * Theater / Plays
 *
 * Kept as a classification in case IPTV-org or Free-TV
 * exposes a suitable channel in the future.
 * ------------------------- */

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

/* -------------------------
 * Comedy
 * ------------------------- */

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

/* -------------------------
 * Family
 * ------------------------- */

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

/* -------------------------
 * Sports
 * ------------------------- */

const sportsKeywords = [
  "sport",
  "sports",

  "football",
  "soccer",

  "basketball",
  "tennis",

  "racing",

  "match",
  "matches",

  "رياضة",
  "رياضي",
  "رياضية",

  "كرة",
  "مباريات"
];

/* =========================================================
 * Playlist classification
 * ========================================================= */

function getPlaylistCategory(
  channel
) {
  const channelCategories =
    channel.categories || [];

  const name =
    channel.name || "";

  /* -------------------------------------------------------
   * 1. Quran
   *
   * Only Egypt + Saudi Arabia.
   * ------------------------------------------------------- */

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

  /* -------------------------------------------------------
   * 2. Theater
   * ------------------------------------------------------- */

  if (
    includesKeyword(
      name,
      [
        ...theaterKeywords,
        ...theaterRelatedKeywords
      ]
    ) ||
    (
      channelCategories.includes(
        "culture"
      ) &&
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
      channelCategories.includes(
        "entertainment"
      ) &&
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

  /* -------------------------------------------------------
   * 3. Comedy
   * ------------------------------------------------------- */

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

  /* -------------------------------------------------------
   * 4. Sports
   * ------------------------------------------------------- */

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

  /* -------------------------------------------------------
   * 5. Kids
   * ------------------------------------------------------- */

  if (
    channelCategories.includes(
      "kids"
    )
  ) {
    return "Kids";
  }

  /* -------------------------------------------------------
   * 6. Family
   * ------------------------------------------------------- */

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

  /* -------------------------------------------------------
   * 7. Series / Drama
   * ------------------------------------------------------- */

  if (
    channelCategories.includes(
      "series"
    ) ||
    includesKeyword(
      name,
      [
        "drama",
        "دراما",
        "series",
        "مسلسلات"
      ]
    )
  ) {
    return "Series";
  }

  /* -------------------------------------------------------
   * 8. Movies
   * ------------------------------------------------------- */

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

      "cinema one",

      "movies action",
      "movies thriller",

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

    /*
     * Language fallback
     */
    const languages =
      getChannelLanguages(
        channel
      );

    if (
      languages.some(
        language =>
          [
            "ar",
            "ara",
            "arb",
            "arabic"
          ].includes(
            language
          )
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
 *
 * This is preference scoring ONLY.
 *
 * NO codec is blocked.
 * NO stream is removed based on audio codec.
 *
 * ffprobe compatibility stays in check-streams.mjs.
 * ========================================================= */

function scoreStream(
  stream
) {
  let score = 0;

  const text =
    `${
      stream.title || ""
    } ${
      stream.label || ""
    }`
      .toLowerCase();

  /*
   * Obvious source warnings
   */
  if (
    text.includes(
      "offline"
    )
  ) {
    score -= 1000;
  }

  if (
    text.includes(
      "geo-blocked"
    )
  ) {
    score -= 50;
  }

  /*
   * Prefer HLS
   */
  if (
    stream.url
      ?.toLowerCase()
      .includes(
        ".m3u8"
      )
  ) {
    score += 40;
  }

  /*
   * Streams without special headers
   * are easier for car players.
   */
  if (
    !stream.referrer
  ) {
    score += 15;
  }

  if (
    !stream.user_agent
  ) {
    score += 10;
  }

  /*
   * Moderate resolutions preferred.
   *
   * Still NO hard filtering.
   */
  if (
    stream.quality
  ) {
    const match =
      stream.quality.match(
        /(\d{3,4})p/i
      );

    if (match) {
      const quality =
        Number(
          match[1]
        );

      if (
        quality === 720
      ) {
        score += 40;
      }

      else if (
        quality === 1080
      ) {
        score += 35;
      }

      else if (
        quality === 576
      ) {
        score += 25;
      }

      else if (
        quality === 480
      ) {
        score += 20;
      }

      else if (
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

  if (
    !available.length
  ) {
    return null;
  }

  return [
    ...available
  ].sort(
    (a, b) =>
      scoreStream(b) -
      scoreStream(a)
  )[0];
}

/* =========================================================
 * IPTV-org selection
 * ========================================================= */

const selected = [];

for (
  const channel
  of channels
) {

  /* -------------------------------------------------------
   * Allowed countries ONLY
   * ------------------------------------------------------- */

  if (
    !allowedArabCountries.has(
      channel.country
    )
  ) {
    continue;
  }

  /*
   * Extra safety:
   * country should also be in IPTV-org ARAB region.
   */
  if (
    !arabRegionCountries.has(
      channel.country
    )
  ) {
    continue;
  }

  /* -------------------------------------------------------
   * Adult
   * ------------------------------------------------------- */

  if (
    isAdultChannel(
      channel
    )
  ) {
    continue;
  }

  /* -------------------------------------------------------
   * Coptic
   * ------------------------------------------------------- */

  if (
    isCopticChannel(
      channel
    )
  ) {
    continue;
  }

  /* -------------------------------------------------------
   * Languages
   * ------------------------------------------------------- */

  if (
    !isAllowedLanguage(
      channel
    )
  ) {
    continue;
  }

  const isEgypt =
    channel.country ===
    "EG";

  const isWantedCategory =
    channel.categories
      ?.some(
        category =>
          sourceCategories.has(
            category
          )
      );

  /*
   * Egypt is intentionally broader.
   *
   * This allows general Egyptian TV/news
   * channels into Egypt TV.
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
   * Egypt fallback
   */
  if (
    !category &&
    isEgypt
  ) {
    category =
      "Egypt TV";
  }

  if (
    !category
  ) {
    continue;
  }

  const stream =
    selectBestStream(
      channel
    );

  if (
    !stream
  ) {
    continue;
  }

  selected.push({
    channel,
    stream,
    category,
    source:
      "IPTV-org"
  });
}

/* =========================================================
 * M3U parser
 * ========================================================= */

function parseM3U(text) {
  const lines =
    String(text || "")
      .split(
        /\r?\n/
      );

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

    /*
     * Find next non-comment URL.
     */
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
        ? line
            .substring(
              line.lastIndexOf(
                ","
              ) + 1
            )
            .trim()
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

      raw:
        line,

      group:
        groupMatch
          ?.[1] || "",

      tvgId:
        idMatch
          ?.[1] || "",

      logo:
        logoMatch
          ?.[1] || "",

      country:
        countryMatch
          ?.[1]
          ?.toUpperCase() ||
        "",

      language:
        languageMatch
          ?.[1] || ""
    });
  }

  return result;
}

const freeTvChannels =
  parseM3U(
    freeTvText
  );

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

/* =========================================================
 * Egypt enrichment from Free-TV
 *
 * Free-TV is currently used ONLY for Egypt.
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

  "al masriyah",

  "watan tv",

  "comedy",

  "family",

  /*
   * Theater keywords remain here.
   * If Free-TV adds such a channel in the future,
   * it can be classified automatically.
   */
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
        normalizeName(
          wanted
        )
      )
  );
}

/* =========================================================
 * Egypt classification
 * ========================================================= */

function classifyEgyptChannel(
  name
) {
  const n =
    normalizeName(
      name
    );

  /* -------------------------------------------------------
   * Theater
   * ------------------------------------------------------- */

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

  /* -------------------------------------------------------
   * Comedy
   * ------------------------------------------------------- */

  if (
    includesKeyword(
      n,
      comedyKeywords
    )
  ) {
    return "Comedy";
  }

  /* -------------------------------------------------------
   * Sports
   * ------------------------------------------------------- */

  if (
    includesKeyword(
      n,
      sportsKeywords
    )
  ) {
    return "Sports";
  }

  /* -------------------------------------------------------
   * Kids
   * ------------------------------------------------------- */

  if (
    includesKeyword(
      n,
      [
        "kids",
        "children",
        "أطفال"
      ]
    )
  ) {
    return "Kids";
  }

  /* -------------------------------------------------------
   * Family
   * ------------------------------------------------------- */

  if (
    includesKeyword(
      n,
      familyKeywords
    )
  ) {
    return "Family";
  }

  /* -------------------------------------------------------
   * Series
   * ------------------------------------------------------- */

  if (
    includesKeyword(
      n,
      [
        "drama",
        "دراما",
        "series",
        "مسلسلات"
      ]
    )
  ) {
    return "Series";
  }

  /* -------------------------------------------------------
   * Foreign movies
   * ------------------------------------------------------- */

  if (
    includesKeyword(
      n,
      [
        "hollywood",
        "bollywood",

        "action",
        "thriller",

        "english",
        "hindi"
      ]
    )
  ) {
    return "Foreign Movies";
  }

  /* -------------------------------------------------------
   * Arabic movies
   * ------------------------------------------------------- */

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

function channelKey(
  name
) {
  return normalizeName(
    name
  )
    .replace(
      /\bhd\b/g,
      ""
    )
    .replace(
      /\bsd\b/g,
      ""
    )
    .replace(
      /\bfhd\b/g,
      ""
    )
    .replace(
      /\buhd\b/g,
      ""
    )
    .replace(
      /\b4k\b/g,
      ""
    )
    .replace(
      /\b1080p\b/g,
      ""
    )
    .replace(
      /\b720p\b/g,
      ""
    )
    .replace(
      /\b576p\b/g,
      ""
    )
    .replace(
      /\b480p\b/g,
      ""
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}

function streamKey(
  url
) {
  return String(
    url || ""
  )
    .trim()
    .toLowerCase();
}

/* =========================================================
 * Existing dedupe indexes
 * ========================================================= */

const existingNames =
  new Set(
    selected.map(
      item =>
        channelKey(
          item.channel.name
        )
    )
  );

const existingStreams =
  new Set(
    selected.map(
      item =>
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
    normalizeName(
      item.group
    );

  /*
   * Free-TV enrichment is Egypt only.
   */
  const isEgypt =
    group === "egypt" ||
    group.includes(
      "egypt"
    );

  if (
    !isEgypt
  ) {
    continue;
  }

  /*
   * Egypt must be an allowed country.
   */
  if (
    !allowedArabCountries.has(
      "EG"
    )
  ) {
    continue;
  }

  /*
   * Adult
   */
  if (
    isAdultExternalChannel(
      item
    )
  ) {
    continue;
  }

  /*
   * Coptic
   */
  if (
    isCopticExternalChannel(
      item
    )
  ) {
    continue;
  }

  /*
   * Selected Egypt channels only
   */
  if (
    !isWantedEgyptChannel(
      item.name
    )
  ) {
    continue;
  }

  /*
   * Valid HTTP stream
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
    channelKey(
      item.name
    );

  const urlKey =
    streamKey(
      item.url
    );

  /*
   * Dedupe
   */
  if (
    existingNames.has(
      nameKey
    ) ||
    existingStreams.has(
      urlKey
    )
  ) {
    continue;
  }

  existingNames.add(
    nameKey
  );

  existingStreams.add(
    urlKey
  );

  selected.push({
    channel: {
      id:
        item.tvgId ||
        `FreeTV.${nameKey
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
 * Final safety filtering
 * ========================================================= */

const finalSelected =
  selected.filter(
    item => {

      /*
       * Selected countries ONLY.
       */
      if (
        !allowedArabCountries.has(
          item.channel.country
        )
      ) {
        return false;
      }

      /*
       * Adult
       */
      if (
        isAdultChannel(
          item.channel
        )
      ) {
        return false;
      }

      /*
       * Coptic
       */
      if (
        isCopticChannel(
          item.channel
        )
      ) {
        return false;
      }

      return true;
    }
  );

/* =========================================================
 * Category sort order
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

/* =========================================================
 * Sorting
 * ========================================================= */

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

    /*
     * Country
     */
    if (
      countryA !==
      countryB
    ) {
      return countryA.localeCompare(
        countryB
      );
    }

    /*
     * Category
     */
    const orderA =
      categoryOrder[
        a.category
      ] ?? 99;

    const orderB =
      categoryOrder[
        b.category
      ] ?? 99;

    if (
      orderA !==
      orderB
    ) {
      return (
        orderA -
        orderB
      );
    }

    /*
     * Channel name
     */
    return String(
      a.channel.name || ""
    ).localeCompare(
      String(
        b.channel.name || ""
      )
    );
  }
);

/* =========================================================
 * Generate M3U
 * ========================================================= */

const output = [];

/*
 * EPG
 */
output.push(
  '#EXTM3U x-tvg-url="https://raw.githubusercontent.com/StrangeDrVN/epg/public/output/guide.xml.gz"'
);

/*
 * Generator info
 */
output.push(
  "# Generated automatically from IPTV-org + Free-TV"
);

output.push(
  "# Countries: BH, EG, JO, KW, PS, QA, SA, SY, TN, AE"
);

output.push(
  "# Filters: Selected Arab countries + Arabic/English/Hindi + No Adult + No Coptic"
);

output.push(
  "# Playback: No codec-based channel filtering"
);

output.push(
  `# Generated: ${new Date().toISOString()}`
);

output.push("");

/* =========================================================
 * Playlist entries
 * ========================================================= */

let currentGroup =
  null;

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

  /*
   * Group header
   */
  if (
    group !==
    currentGroup
  ) {
    currentGroup =
      group;

    output.push(
      `# === ${group} ===`
    );
  }

  /*
   * Logo
   */
  const logo =
    item.logo ||
    logoMap.get(
      channel.id
    ) ||
    "";

  /*
   * Channel name
   */
  const name =
    String(
      channel.name ||
      ""
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

  const safeId =
    String(
      channel.id ||
      ""
    ).replace(
      /"/g,
      "'"
    );

  const safeLogo =
    String(
      logo ||
      ""
    ).replace(
      /"/g,
      "%22"
    );

  /*
   * EXTINF attributes
   */
  const attributes = [
    `tvg-id="${safeId}"`,

    `tvg-name="${safeName}"`,

    safeLogo
      ? `tvg-logo="${safeLogo}"`
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
  "================================="
);

console.log(
  `✅ Generated ${finalSelected.length} channels`
);

console.log(
  "================================="
);

/* =========================================================
 * Country summary
 * ========================================================= */

const countrySummary = {};

for (
  const item
  of finalSelected
) {
  const country =
    countryName(
      item.channel.country
    );

  countrySummary[country] =
    (
      countrySummary[
        country
      ] || 0
    ) + 1;
}

console.log("");
console.log(
  "Countries"
);

console.log(
  "================================="
);

console.table(
  countrySummary
);

/* =========================================================
 * Category summary
 * ========================================================= */

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
    (
      categorySummary[
        key
      ] || 0
    ) + 1;
}

console.log("");
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
    item.source ||
    "Unknown";

  sourceSummary[source] =
    (
      sourceSummary[
        source
      ] || 0
    ) + 1;
}

console.log("");
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
 * Configuration summary
 * ========================================================= */

console.log("");
console.log(
  "================================="
);

console.log(
  "Playlist configuration"
);

console.log(
  "================================="
);

console.log(
  "✅ IPTV-org"
);

console.log(
  "✅ Free-TV"
);

console.log(
  "✅ Bahrain"
);

console.log(
  "✅ Egypt"
);

console.log(
  "✅ Jordan"
);

console.log(
  "✅ Kuwait"
);

console.log(
  "✅ Palestine"
);

console.log(
  "✅ Qatar"
);

console.log(
  "✅ Saudi Arabia"
);

console.log(
  "✅ Syria"
);

console.log(
  "✅ Tunisia"
);

console.log(
  "✅ United Arab Emirates"
);

console.log(
  "✅ Arabic"
);

console.log(
  "✅ English"
);

console.log(
  "✅ Hindi allowed"
);

console.log(
  "✅ Adult / XXX blocked"
);

console.log(
  "✅ Coptic channels blocked"
);

console.log(
  "✅ Quran"
);

console.log(
  "✅ Kids"
);

console.log(
  "✅ Family"
);

console.log(
  "✅ Comedy"
);

console.log(
  "✅ Theater classification ready"
);

console.log(
  "✅ Series"
);

console.log(
  "✅ Arabic Movies"
);

console.log(
  "✅ Foreign Movies"
);

console.log(
  "✅ Sports"
);

console.log(
  "✅ Egypt general TV"
);

console.log(
  "✅ Audio-only / Radio streams allowed"
);

console.log(
  "✅ No codec-based stream removal"
);

console.log(
  "================================="
);
