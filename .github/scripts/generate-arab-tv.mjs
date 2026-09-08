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
 * Optional HLS validation
 *
 * Used ONLY for curated Egypt fallback channels.
 * ========================================================= */

async function isValidHls(
  url,
  timeoutMs = 12000
) {
  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () => controller.abort(),
      timeoutMs
    );

  try {
    const response =
      await fetch(
        url,
        {
          signal:
            controller.signal,

          redirect:
            "follow",

          headers: {
            "User-Agent":
              "Mozilla/5.0 CarTV/1.0",

            Accept:
              "application/vnd.apple.mpegurl,application/x-mpegURL,text/plain,*/*"
          }
        }
      );

    if (!response.ok) {
      return false;
    }

    const text =
      await response.text();

    return text
      .trimStart()
      .startsWith(
        "#EXTM3U"
      );
  }
  catch {
    return false;
  }
  finally {
    clearTimeout(
      timeout
    );
  }
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
  return String(
    name || ""
  )
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
    normalizeName(
      text
    );

  return keywords.some(
    keyword =>
      normalized.includes(
        normalizeName(
          keyword
        )
      )
  );
}

/* =========================================================
 * Allowed countries
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
    countryNames[
      code
    ] ||
    code
  );
}

/* =========================================================
 * ARAB region
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
 * Allowed languages
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
     * Keep Hindi for:
     * MBC Bollywood
     * Zee Alwan
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
 * Streams lookup
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
    .push(
      stream
    );
}

/* =========================================================
 * Adult filter
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
    ${(channel.alt_names || []).join(" ")}
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
  "copt",

  "coptic tv",
  "coptic channel",
  "coptic satellite",
  "coptic satellite channel",

  "coptic orthodox",
  "coptic orthodox tv",
  "coptic orthodox church",

  "orthodox coptic",

  "قبطي",
  "قبطى",
  "قبطية",
  "قبطيه",

  "القبطية",
  "القبطيه",

  "الأقباط",
  "الاقباط",

  "الكنيسة القبطية",
  "الكنيسه القبطيه",

  "الكنيسة القبطية الأرثوذكسية",
  "الكنيسه القبطيه الارثوذكسيه",

  "aghapy",
  "aghapi",
  "aghapy tv",

  "me sat",
  "mesat",
  "me sat tv",

  "logos tv",
  "logos coptic",
  "logos coptic channel",

  /*
   * Never use "ctv" alone.
   */
  "ctv coptic",
  "coptic ctv",
  "ctv egypt",
  "ctv eg",

  "coptic youth",
  "coptic youth channel",

  "st mark coptic",
  "saint mark coptic",

  "st mary coptic",
  "saint mary coptic",

  "pope shenouda",
  "shenouda tv"
];

function getCopticSearchText(
  channel
) {
  return `
    ${channel.id || ""}
    ${channel.name || ""}
    ${(channel.alt_names || []).join(" ")}
    ${(channel.categories || []).join(" ")}
    ${channel.network || ""}
    ${channel.owner || ""}
  `;
}

function isCopticChannel(
  channel
) {
  return includesKeyword(
    getCopticSearchText(
      channel
    ),
    copticKeywords
  );
}

/* =========================================================
 * Explicit blocked channels
 * ========================================================= */

const blockedChannelKeywords = [
  "koogi",
  "koogi tv"
];

function isBlockedChannel(
  channel
) {
  const text = `
    ${channel.id || ""}
    ${channel.name || ""}
    ${(channel.alt_names || []).join(" ")}
  `;

  return includesKeyword(
    text,
    blockedChannelKeywords
  );
}

function isBlockedExternalChannel(
  item
) {
  const text = `
    ${item.name || ""}
    ${item.group || ""}
    ${item.tvgId || ""}
    ${item.raw || ""}
  `;

  return includesKeyword(
    text,
    blockedChannelKeywords
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
        normalizeLanguage(
          language
        )
      );
    }
  }

  return [
    ...detected
  ].filter(
    Boolean
  );
}

function isAllowedLanguage(
  channel
) {
  const languages =
    getChannelLanguages(
      channel
    );

  if (
    !languages.length
  ) {
    return true;
  }

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
 * Theater
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
 * ON / OnTime Sports
 *
 * Handles:
 * ON Sport
 * ON Sports
 * OnTime Sports
 * OnTime Sports 1
 * OnTime Sports 2
 * OnTime Sports 3
 * ========================================================= */

const onTimeSportsKeywords = [
  "on sport",
  "on sports",

  "ontime sport",
  "ontime sports",

  "on time sport",
  "on time sports",

  "ontime sports 1",
  "ontime sports 2",
  "ontime sports 3",

  "on time sports 1",
  "on time sports 2",
  "on time sports 3",

  "on sport 1",
  "on sport 2",
  "on sport 3",

  "أون سبورت",
  "اون سبورت",

  "أون تايم سبورت",
  "اون تايم سبورت",

  "أون تايم سبورتس",
  "اون تايم سبورتس"
];

function isOnTimeSportsChannel(
  channel
) {
  const text = `
    ${channel.id || ""}
    ${channel.name || ""}
    ${(channel.alt_names || []).join(" ")}
  `;

  return includesKeyword(
    text,
    onTimeSportsKeywords
  );
}

/* =========================================================
 * Classification
 * ========================================================= */

function getPlaylistCategory(
  channel
) {
  const channelCategories =
    channel.categories || [];

  const name =
    channel.name || "";

  /* Quran */

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

  /* Theater */

  if (
    includesKeyword(
      name,
      [
        ...theaterKeywords,
        ...theaterRelatedKeywords
      ]
    )
  ) {
    return "Theater";
  }

  /* Comedy */

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

  /* Sports
   *
   * OnTime Sports gets explicit
   * priority here.
   */

  if (
    isOnTimeSportsChannel(
      channel
    ) ||
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

  /* Kids */

  if (
    channelCategories.includes(
      "kids"
    )
  ) {
    return "Kids";
  }

  /* Family */

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

  /* Series */

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

  /* Movies */

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
 * NO codec filtering.
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

  if (
    stream.url
      ?.toLowerCase()
      .includes(
        ".m3u8"
      )
  ) {
    score += 40;
  }

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

  if (
    stream.quality
  ) {
    const match =
      stream.quality.match(
        /(\d{3,4})p/i
      );

    if (
      match
    ) {
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
      scoreStream(
        b
      ) -
      scoreStream(
        a
      )
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
  if (
    !allowedArabCountries.has(
      channel.country
    )
  ) {
    continue;
  }

  if (
    isBlockedChannel(
      channel
    )
  ) {
    continue;
  }

  if (
    !arabRegionCountries.has(
      channel.country
    )
  ) {
    continue;
  }

  if (
    isAdultChannel(
      channel
    )
  ) {
    continue;
  }

  if (
    isCopticChannel(
      channel
    )
  ) {
    continue;
  }

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

function parseM3U(
  text
) {
  const lines =
    String(
      text || ""
    ).split(
      /\r?\n/
    );

  const result = [];

  for (
    let i = 0;
    i < lines.length;
    i++
  ) {
    const line =
      lines[
        i
      ].trim();

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
        lines[
          j
        ].trim();

      if (
        !next
      ) {
        continue;
      }

      if (
        !next.startsWith(
          "#"
        )
      ) {
        url =
          next;

        break;
      }
    }

    if (
      !url
    ) {
      continue;
    }

    const name =
      line.includes(
        ","
      )
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
        groupMatch?.[1] || "",

      tvgId:
        idMatch?.[1] || "",

      logo:
        logoMatch?.[1] || "",

      country:
        countryMatch?.[1]
          ?.toUpperCase() ||
        "",

      language:
        languageMatch?.[1] || ""
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
    ${item.raw || ""}
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
    ${item.raw || ""}
  `;

  return includesKeyword(
    text,
    copticKeywords
  );
}

/* =========================================================
 * Egypt wanted names
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

  /*
   * ON Entertainment
   *
   * Do NOT use "on" alone.
   */
  "on e",
  "on tv",
  "on drama",

  /*
   * ON / OnTime Sports
   */
  "on sport",
  "on sports",

  "ontime sport",
  "ontime sports",

  "on time sport",
  "on time sports",

  "ontime sports 1",
  "ontime sports 2",
  "ontime sports 3",

  "on time sports 1",
  "on time sports 2",
  "on time sports 3",

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
    normalizeName(
      name
    );

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

  /* Theater */

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

  /* Comedy */

  if (
    includesKeyword(
      n,
      comedyKeywords
    )
  ) {
    return "Comedy";
  }

  /*
   * OnTime Sports explicit classification.
   */

  if (
    includesKeyword(
      n,
      onTimeSportsKeywords
    )
  ) {
    return "Sports";
  }

  /* Sports */

  if (
    includesKeyword(
      n,
      sportsKeywords
    )
  ) {
    return "Sports";
  }

  /* Kids */

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

  /* Family */

  if (
    includesKeyword(
      n,
      familyKeywords
    )
  ) {
    return "Family";
  }

  /* Series */

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

  /* Foreign movies */

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

  /* Arabic movies */

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
  if (
    isBlockedExternalChannel(
      item
    )
  ) {
    continue;
  }

  const group =
    normalizeName(
      item.group
    );

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

  if (
    !allowedArabCountries.has(
      "EG"
    )
  ) {
    continue;
  }

  if (
    isAdultExternalChannel(
      item
    )
  ) {
    continue;
  }

  if (
    isCopticExternalChannel(
      item
    )
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
 * Curated Egypt fallback candidates
 *
 * IMPORTANT:
 * These candidates are NOT trusted automatically.
 * Every URL must pass isValidHls() before inclusion.
 *
 * OnTime Sports is NOT given an untrusted hardcoded
 * stream here. IPTV-org + Free-TV discovery above will
 * automatically include it whenever a public stream exists.
 * ========================================================= */

const egyptFallbackCandidates = [
  {
    id:
      "ONE.eg",

    name:
      "ON E",

    category:
      "Egypt TV",

    url:
      "https://bcovlive-a.akamaihd.net/3dc60bab470f4c9fbf00408ecb7c3d7a/eu-west-1/6057955906001/playlist_dvr.m3u8",

    logo:
      ""
  },

  {
    id:
      "ONDrama.eg",

    name:
      "ON Drama",

    category:
      "Series",

    url:
      "https://live20.bozztv.com/gin-36bay4/ga-ondrama/tracks-v1a1/mono.m3u8",

    logo:
      ""
  },

  {
    id:
      "AlNahar.eg",

    name:
      "Al Nahar",

    category:
      "Egypt TV",

    url:
      "https://live20.bozztv.com/gin-36bay4/ga-alnahar/tracks-v1a1/mono.m3u8",

    logo:
      ""
  },

  {
    id:
      "AlNaharDrama.eg",

    name:
      "Al Nahar Drama",

    category:
      "Series",

    url:
      "https://live20.bozztv.com/gin-36bay4/ga-alnahardrama/tracks-v1a1/mono.m3u8",

    logo:
      ""
  },

  {
    id:
      "DMCDrama.eg",

    name:
      "DMC Drama",

    category:
      "Series",

    url:
      "https://uvotv-aniview.global.ssl.fastly.net/10010/dvr/hls/dmcdrama/playlist.m3u8",

    logo:
      ""
  },

  {
    id:
      "SadaElBalad.eg",

    name:
      "Sada El Balad",

    category:
      "Egypt TV",

    url:
      "https://uvotv-aniview.global.ssl.fastly.net/10010/dvr/hls/sadaalbalad/playlist.m3u8",

    logo:
      ""
  },

  {
    id:
      "SadaElBaladDrama.eg",

    name:
      "Sada El Balad Drama",

    category:
      "Series",

    url:
      "https://uvotv-aniview.global.ssl.fastly.net/10010/dvr/hls/sadaalbaladdrama/playlist.m3u8",

    logo:
      ""
  }
];

/* =========================================================
 * Add validated Egypt fallback
 * ========================================================= */

console.log("");

console.log(
  "Checking Egypt fallback streams..."
);

for (
  const candidate
  of egyptFallbackCandidates
) {
  const candidateChannel = {
    id:
      candidate.id,

    name:
      candidate.name,

    country:
      "EG",

    alt_names:
      [],

    categories:
      []
  };

  if (
    isBlockedChannel(
      candidateChannel
    )
  ) {
    continue;
  }

  if (
    isCopticChannel(
      candidateChannel
    )
  ) {
    continue;
  }

  const nameKey =
    channelKey(
      candidate.name
    );

  const urlKey =
    streamKey(
      candidate.url
    );

  if (
    existingNames.has(
      nameKey
    ) ||
    existingStreams.has(
      urlKey
    )
  ) {
    console.log(
      `↪ Already exists: ${candidate.name}`
    );

    continue;
  }

  console.log(
    `🔎 Checking: ${candidate.name}`
  );

  const valid =
    await isValidHls(
      candidate.url
    );

  if (
    !valid
  ) {
    console.log(
      `⚠️ Skipped unavailable fallback: ${candidate.name}`
    );

    continue;
  }

  existingNames.add(
    nameKey
  );

  existingStreams.add(
    urlKey
  );

  selected.push({
    channel:
      candidateChannel,

    stream: {
      url:
        candidate.url
    },

    category:
      candidate.category,

    logo:
      candidate.logo,

    source:
      "Egypt-Fallback"
  });

  console.log(
    `✅ Added fallback: ${candidate.name}`
  );
}

/* =========================================================
 * Final safety filtering
 * ========================================================= */

const finalSelected =
  selected.filter(
    item => {
      if (
        !allowedArabCountries.has(
          item.channel.country
        )
      ) {
        return false;
      }

      if (
        isBlockedChannel(
          item.channel
        )
      ) {
        return false;
      }

      if (
        isAdultChannel(
          item.channel
        )
      ) {
        return false;
      }

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
 * Category order
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

    if (
      countryA !==
      countryB
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
      orderA !==
      orderB
    ) {
      return (
        orderA -
        orderB
      );
    }

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

output.push(
  '#EXTM3U x-tvg-url="https://raw.githubusercontent.com/StrangeDrVN/epg/public/output/guide.xml.gz"'
);

output.push(
  "# Generated automatically from IPTV-org + Free-TV + validated Egypt fallback"
);

output.push(
  "# Countries: BH, EG, JO, KW, PS, QA, SA, SY, TN, AE"
);

output.push(
  "# Filters: Selected Arab countries + Arabic/English/Hindi + No Adult + No Coptic + Koogi Blocked"
);

output.push(
  "# Egypt discovery: ON / OnTime Sports / Al Nahar / DMC / Sada El Balad"
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

  const logo =
    item.logo ||
    logoMap.get(
      channel.id
    ) ||
    "";

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

  const attributes = [
    `tvg-id="${safeId}"`,

    `tvg-name="${safeName}"`,

    safeLogo
      ? `tvg-logo="${safeLogo}"`
      : "",

    `group-title="${safeGroup}"`
  ]
    .filter(
      Boolean
    )
    .join(
      " "
    );

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
  output.join(
    "\n"
  ),
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

  countrySummary[
    country
  ] =
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

  categorySummary[
    key
  ] =
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

  sourceSummary[
    source
  ] =
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
 * OnTime Sports summary
 * ========================================================= */

const onTimeSportsFound =
  finalSelected.filter(
    item =>
      item.channel.country ===
        "EG" &&
      isOnTimeSportsChannel(
        item.channel
      )
  );

console.log("");

console.log(
  "OnTime Sports"
);

console.log(
  "================================="
);

if (
  onTimeSportsFound.length
) {
  for (
    const item
    of onTimeSportsFound
  ) {
    console.log(
      `✅ ${item.channel.name} [${item.source}]`
    );
  }
}
else {
  console.log(
    "ℹ️ No public OnTime Sports stream found in the current sources."
  );
}

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
  "✅ Validated Egypt fallback"
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
  "✅ Koogi blocked"
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
  "✅ OnTime Sports discovery"
);

console.log(
  "✅ Egypt general TV"
);

console.log(
  "✅ Egypt fallback streams tested before inclusion"
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
