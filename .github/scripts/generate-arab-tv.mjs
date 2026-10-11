
import fs from "node:fs/promises";

const API = "https://iptv-org.github.io/api";
const FREE_TV_URL =
  "https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8";

const EPG_URL =
  "https://raw.githubusercontent.com/StrangeDrVN/epg/public/output/guide.xml.gz";

const OUTPUT_FILE = "playlists/arab-tv.m3u";

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

const allowedCountries = new Set(Object.keys(countryNames));

const allowedLanguages = new Set([
  "ar", "ara", "arb", "arabic",
  "en", "eng", "english",
  "hi", "hin", "hindi"
]);

const sourceCategories = new Set([
  "kids", "movies", "series", "sports",
  "religious", "comedy", "family",
  "entertainment", "culture"
]);

const categoryOrder = [
  "Quran",
  "Kids",
  "Family",
  "Comedy",
  "Theater",
  "Series",
  "Arabic Movies",
  "Foreign Movies",
  "Sports",
  "Egypt TV"
];

const keywords = {
  adult: [
    "xxx", "adult", "adults only", "18+",
    "porn", "porno", "pornography",
    "erotic", "sex", "sexy",
    "playboy", "penthouse", "hustler",
    "اباحي", "إباحي", "اباحية", "إباحية",
    "للكبار", "للبالغين", "جنسي", "جنسية"
  ],

  coptic: [
    "coptic", "copts", "copt",
    "coptic tv", "coptic orthodox",
    "aghapy", "aghapi", "mesat", "me sat",
    "logos coptic", "logos tv",
    "ctv coptic", "ctv egypt", "ctv eg",
    "coptic youth", "pope shenouda",
    "shenouda tv",
    "قبطي", "قبطى", "قبطية", "قبطيه",
    "القبطية", "الأقباط", "الاقباط",
    "الكنيسة القبطية", "الكنيسه القبطيه"
  ],

  blocked: ["koogi", "koogi tv"],

  quran: [
    "quran", "qur'an", "koran",
    "holy quran", "quran kareem",
    "قرآن", "القرآن", "القرآن الكريم"
  ],

  theater: [
    "theater", "theatre", "theatrical",
    "stage play", "stage plays",
    "classic plays", "masrah", "masra7",
    "masrahiyat", "masrahyat",
    "مسرح", "المسرح", "مسرحية",
    "مسرحيات", "المسرحيات"
  ],

  comedy: [
    "comedy", "comedies", "comic",
    "funny", "laugh", "ضحك",
    "كوميدي", "كوميديا", "كوميدى"
  ],

  family: [
    "family", "families",
    "عائلة", "العائلة",
    "عائلي", "عائلية", "عائلى"
  ],

  sports: [
    "sport", "sports", "football",
    "soccer", "basketball", "tennis",
    "racing", "match", "matches",
    "رياضة", "رياضي", "رياضية",
    "كرة", "مباريات"
  ],

  onTimeSports: [
    "on sport", "on sports",
    "ontime sport", "ontime sports",
    "on time sport", "on time sports",
    "أون سبورت", "اون سبورت",
    "أون تايم سبورت", "اون تايم سبورت",
    "أون تايم سبورتس", "اون تايم سبورتس"
  ],

  series: [
    "drama", "series", "دراما", "مسلسلات"
  ],

  foreignMovies: [
    "hollywood", "bollywood",
    "action", "thriller", "english",
    "hindi", "osn movies"
  ],

  arabicMovies: [
    "rotana cinema", "aflam",
    "cinema masr", "arabic",
    "افلام", "أفلام", "سينما"
  ]
};

function normalize(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasKeyword(text, words) {
  const value = normalize(text);
  return words.some(word =>
    value.includes(normalize(word))
  );
}

function channelText(channel) {
  return [
    channel.id,
    channel.name,
    ...(channel.alt_names || []),
    ...(channel.categories || []),
    channel.network,
    channel.owner
  ].filter(Boolean).join(" ");
}

function isBlocked(channel) {
  const text = channelText(channel);

  return Boolean(channel.is_nsfw) ||
    (channel.categories || []).includes("xxx") ||
    hasKeyword(text, keywords.adult) ||
    hasKeyword(text, keywords.coptic) ||
    hasKeyword(text, keywords.blocked);
}

function validLanguage(languages) {
  if (!languages?.length) return true;

  return languages.some(language =>
    allowedLanguages.has(
      String(language).toLowerCase()
    )
  );
}

async function fetchWithTimeout(url, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    timeoutMs
  );

  try {
    return await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 CarTV/1.0",
        Accept: "*/*"
      }
    });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(url) {
  const response = await fetchWithTimeout(url, 45000);

  if (!response.ok) {
    throw new Error(`${url}: HTTP ${response.status}`);
  }

  return response.json();
}

async function fetchText(url) {
  const response = await fetchWithTimeout(url, 45000);

  if (!response.ok) {
    throw new Error(`${url}: HTTP ${response.status}`);
  }

  return response.text();
}

/*
 * This only checks that an HLS manifest responds.
 * It does not prove playback, geographic availability,
 * or redistribution rights.
 */
async function validateHls(url, timeoutMs = 12000) {
  try {
    const response = await fetchWithTimeout(url, timeoutMs);

    if (!response.ok) return false;

    const text = await response.text();

    return text.trimStart().startsWith("#EXTM3U");
  } catch {
    return false;
  }
}

function parseM3U(text) {
  const lines = text.split(/\r?\n/);
  const items = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (!line.startsWith("#EXTINF")) continue;

    const attrs = {};

    for (const match of line.matchAll(
      /([\w-]+)="([^"]*)"/g
    )) {
      attrs[match[1]] = match[2];
    }

    const name = line.slice(
      line.lastIndexOf(",") + 1
    ).trim();

    let url = "";

    for (let j = i + 1; j < lines.length; j++) {
      const next = lines[j].trim();

      if (!next) continue;
      if (next.startsWith("#EXTINF")) break;
      if (next.startsWith("#")) continue;

      url = next;
      break;
    }

    if (!url) continue;

    items.push({
      name,
      url,
      id: attrs["tvg-id"] || "",
      logo: attrs["tvg-logo"] || "",
      group: attrs["group-title"] || "",
      country: attrs["tvg-country"] || "",
      language: attrs["tvg-language"] || ""
    });
  }

  return items;
}

function classify(channel, languages = []) {
  const name = channel.name || "";
  const categories = channel.categories || [];

  if (
    ["EG", "SA"].includes(channel.country) &&
    hasKeyword(name, keywords.quran)
  ) {
    return "Quran";
  }

  if (hasKeyword(name, keywords.theater)) {
    return "Theater";
  }

  if (
    categories.includes("comedy") ||
    hasKeyword(name, keywords.comedy)
  ) {
    return "Comedy";
  }

  if (
    categories.includes("sports") ||
    hasKeyword(name, keywords.sports) ||
    hasKeyword(name, keywords.onTimeSports)
  ) {
    return "Sports";
  }

  if (categories.includes("kids")) {
    return "Kids";
  }

  if (
    categories.includes("family") ||
    hasKeyword(name, keywords.family)
  ) {
    return "Family";
  }

  if (
    categories.includes("series") ||
    hasKeyword(name, keywords.series)
  ) {
    return "Series";
  }

  if (
    categories.includes("movies") ||
    hasKeyword(name, [
      ...keywords.foreignMovies,
      ...keywords.arabicMovies
    ])
  ) {
    if (hasKeyword(name, keywords.foreignMovies)) {
      return "Foreign Movies";
    }

    if (hasKeyword(name, keywords.arabicMovies)) {
      return "Arabic Movies";
    }

    return languages.some(lang =>
      ["ar", "ara", "arb", "arabic"].includes(lang)
    ) ? "Arabic Movies" : "Foreign Movies";
  }

  return channel.country === "EG"
    ? "Egypt TV"
    : null;
}

function scoreStream(stream) {
  let score = 0;
  const url = stream.url || "";

  if (/\.m3u8(?:[?#]|$)/i.test(url)) score += 40;
  if (!stream.referrer) score += 15;
  if (!stream.user_agent) score += 10;

  const quality = String(stream.quality || "");

  if (/720p/i.test(quality)) score += 40;
  else if (/1080p/i.test(quality)) score += 35;
  else if (/576p/i.test(quality)) score += 25;
  else if (/480p/i.test(quality)) score += 20;

  if (/offline/i.test(stream.title || "")) {
    score -= 1000;
  }

  return score;
}

function dedupeName(name) {
  return normalize(name)
    .replace(
      /\b(hd|sd|fhd|uhd|4k|1080p|720p)\b/g,
      ""
    )
    .replace(/\s+/g, " ")
    .trim();
}

const selected = [];
const existingNames = new Set();
const existingUrls = new Set();

function addChannel(item) {
  if (!item.url || !/^https?:\/\//i.test(item.url)) {
    return false;
  }

  const nameKey =
    `${item.country}:${dedupeName(item.name)}`;

  const urlKey = item.url.trim();

  if (
    existingNames.has(nameKey) ||
    existingUrls.has(urlKey)
  ) {
    return false;
  }

  const channel = {
    id: item.id,
    name: item.name,
    country: item.country,
    categories: [item.category]
  };

  if (isBlocked(channel)) return false;

  existingNames.add(nameKey);
  existingUrls.add(urlKey);
  selected.push(item);

  return true;
}

console.log("Loading IPTV-org and Free-TV...");

const [
  channels,
  streams,
  feeds,
  regions,
  logos,
  freeTvText
] = await Promise.all([
  fetchJson(`${API}/channels.json`),
  fetchJson(`${API}/streams.json`),
  fetchJson(`${API}/feeds.json`),
  fetchJson(`${API}/regions.json`),
  fetchJson(`${API}/logos.json`),
  fetchText(FREE_TV_URL)
]);

const arabRegion = regions.find(
  region => region.code === "ARAB"
);

if (!arabRegion) {
  throw new Error("ARAB region not found");
}

const arabCountries = new Set(arabRegion.countries);

const feedMap = new Map(
  feeds.map(feed => [
    `${feed.channel}@${feed.id}`,
    feed
  ])
);

const logoMap = new Map();

for (const logo of logos) {
  if (
    logo.in_use &&
    !logoMap.has(logo.channel)
  ) {
    logoMap.set(logo.channel, logo.url);
  }
}

const streamsByChannel = new Map();

for (const stream of streams) {
  if (!stream.channel || !stream.url) continue;

  if (!streamsByChannel.has(stream.channel)) {
    streamsByChannel.set(stream.channel, []);
  }

  streamsByChannel.get(stream.channel).push(stream);
}

for (const channel of channels) {
  if (!allowedCountries.has(channel.country)) continue;
  if (!arabCountries.has(channel.country)) continue;
  if (isBlocked(channel)) continue;

  const available = streamsByChannel.get(channel.id) || [];
  if (!available.length) continue;

  const languages = new Set(channel.languages || []);

  for (const stream of available) {
    const feed = feedMap.get(
      `${stream.channel}@${stream.feed}`
    );

    for (const lang of feed?.languages || []) {
      languages.add(lang);
    }
  }

  const normalizedLanguages = [...languages].map(
    lang => String(lang).toLowerCase()
  );

  if (!validLanguage(normalizedLanguages)) continue;

  const isEgypt = channel.country === "EG";

  const wantedCategory = (channel.categories || [])
    .some(category => sourceCategories.has(category));

  if (!isEgypt && !wantedCategory) continue;

  const category = classify(
    channel,
    normalizedLanguages
  );

  if (!category) continue;

  const bestStream = [...available].sort(
    (a, b) => scoreStream(b) - scoreStream(a)
  )[0];

  addChannel({
    id: channel.id,
    name: channel.name,
    country: channel.country,
    category,
    url: bestStream.url,
    logo: logoMap.get(channel.id) || "",
    source: "IPTV-org"
  });
}

/* Free-TV: Egypt enrichment only */

const freeTvChannels = parseM3U(freeTvText);

const egyptWanted = [
  "mbc masr", "mbc 1 egypt",
  "alhayat", "al hayat",
  "al qahera news", "cairo news",
  "cbc", "dmc",
  "on e", "on tv", "on drama",
  "on sport", "on sports",
  "ontime sport", "ontime sports",
  "on time sport", "on time sports",
  "al nahar", "sada el balad",
  "rotana cinema", "mix hollywood",
  "al masriyah", "watan tv",
  "comedy", "family",
  "theater", "theatre", "masrah",
  "مسرح", "مسرحيات",
  "sports"
];

for (const item of freeTvChannels) {
  const isEgypt =
    normalize(item.group).includes("egypt") ||
    item.country.toUpperCase() === "EG";

  if (!isEgypt) continue;

  if (!hasKeyword(item.name, egyptWanted)) continue;

  const channel = {
    id: item.id,
    name: item.name,
    country: "EG",
    categories: []
  };

  if (isBlocked(channel)) continue;

  addChannel({
    id: item.id || `FreeTV.${dedupeName(item.name)}.eg`,
    name: item.name,
    country: "EG",
    category: classify(channel) || "Egypt TV",
    url: item.url,
    logo: item.logo,
    source: "Free-TV"
  });
}

/*
 * Egypt fallback candidates.
 *
 * These are unverified third-party URLs.
 * They are included only when the HLS manifest
 * responds successfully during generation.
 */

const egyptFallbackCandidates = [
  {
    id: "ONE.eg",
    name: "ON E",
    category: "Egypt TV",
    url:
      "https://bcovlive-a.akamaihd.net/3dc60bab470f4c9fbf00408ecb7c3d7a/eu-west-1/6057955906001/playlist_dvr.m3u8"
  },
  {
    id: "ONDrama.eg",
    name: "ON Drama",
    category: "Series",
    url:
      "https://live20.bozztv.com/gin-36bay4/ga-ondrama/tracks-v1a1/mono.m3u8"
  },
  {
    id: "AlNahar.eg",
    name: "Al Nahar",
    category: "Egypt TV",
    url:
      "https://live20.bozztv.com/gin-36bay4/ga-alnahar/tracks-v1a1/mono.m3u8"
  },
  {
    id: "AlNaharDrama.eg",
    name: "Al Nahar Drama",
    category: "Series",
    url:
      "https://live20.bozztv.com/gin-36bay4/ga-alnahardrama/tracks-v1a1/mono.m3u8"
  },
  {
    id: "DMCDrama.eg",
    name: "DMC Drama",
    category: "Series",
    url:
      "https://uvotv-aniview.global.ssl.fastly.net/10010/dvr/hls/dmcdrama/playlist.m3u8"
  },
  {
    id: "SadaElBalad.eg",
    name: "Sada El Balad",
    category: "Egypt TV",
    url:
      "https://uvotv-aniview.global.ssl.fastly.net/10010/dvr/hls/sadaalbalad/playlist.m3u8"
  },
  {
    id: "SadaElBaladDrama.eg",
    name: "Sada El Balad Drama",
    category: "Series",
    url:
      "https://uvotv-aniview.global.ssl.fastly.net/10010/dvr/hls/sadaalbaladdrama/playlist.m3u8"
  }
];

console.log("Checking Egypt fallback candidates...");

for (const candidate of egyptFallbackCandidates) {
  const exists = selected.some(item =>
    item.country === "EG" &&
    dedupeName(item.name) === dedupeName(candidate.name)
  );

  if (exists) continue;

  const valid = await validateHls(candidate.url);

  if (!valid) {
    console.log(`Skipped: ${candidate.name}`);
    continue;
  }

  if (addChannel({
    ...candidate,
    country: "EG",
    logo: "",
    source: "Egypt-Fallback"
  })) {
    console.log(`Added: ${candidate.name}`);
  }
}

/*
 * New: beIN SPORTS XTRA.
 *
 * A free-to-view channel candidate.
 * Not the subscription beIN SPORTS 1-9 channels.
 *
 * Region is International to avoid claiming
 * this is the Qatar/MENA channel.
 */

const internationalCandidates = [
  {
    id: "beINSportsXTRA.int",
    name: "beIN SPORTS XTRA",
    country: "INT",
    category: "Sports",
    logo: "",
    url: "https://bein-xtra-bein.amagi.tv/playlist.m3u8",
    source: "International-Fallback"
  }
];

console.log("Checking international sports...");

for (const candidate of internationalCandidates) {
  const valid = await validateHls(candidate.url);

  if (!valid) {
    console.log(
      `Skipped (unavailable or restricted): ${candidate.name}`
    );
    continue;
  }

  if (addChannel(candidate)) {
    console.log(`Added: ${candidate.name}`);
  }
}

/*
 * Sort by country, category and name.
 */

selected.sort((a, b) => {
  const countryA = countryNames[a.country] ||
    (a.country === "INT" ? "International" : a.country);

  const countryB = countryNames[b.country] ||
    (b.country === "INT" ? "International" : b.country);

  const countryCompare = countryA.localeCompare(countryB);

  if (countryCompare !== 0) return countryCompare;

  const categoryA = categoryOrder.indexOf(a.category);
  const categoryB = categoryOrder.indexOf(b.category);

  if (categoryA !== categoryB) {
    return categoryA - categoryB;
  }

  return a.name.localeCompare(b.name);
});

/*
 * Write M3U.
 */

function escapeAttribute(value) {
  return String(value || "")
    .replace(/"/g, "'")
    .replace(/[\r\n]/g, " ");
}

const output = [
  `#EXTM3U x-tvg-url="${EPG_URL}"`,
  "# Generated from IPTV-org + Free-TV + validated fallback",
  `# Countries: ${Object.keys(countryNames).join(", ")} + International`,
  "# Categories: Quran, Kids, Family, Comedy, Theater, Series, Arabic Movies, Foreign Movies, Sports, Egypt TV",
  "# beIN SPORTS XTRA: validated candidate only",
  "# No codec-based filtering",
  `# Generated: ${new Date().toISOString()}`,
  ""
];

let currentGroup = "";

for (const item of selected) {
  const countryName = countryNames[item.country] ||
    (item.country === "INT" ? "International" : item.country);

  const group = `${countryName} | ${item.category}`;

  if (group !== currentGroup) {
    currentGroup = group;
    output.push(`# === ${group} ===`);
  }

  const name = escapeAttribute(item.name);

  const attrs = [
    `tvg-id="${escapeAttribute(item.id)}"`,
    `tvg-name="${name}"`,
    item.logo
      ? `tvg-logo="${escapeAttribute(item.logo)}"`
      : "",
    `group-title="${escapeAttribute(group)}"`
  ].filter(Boolean).join(" ");

  output.push(`#EXTINF:-1 ${attrs},${name}`);
  output.push(item.url);
  output.push("");
}

await fs.mkdir("playlists", { recursive: true });

await fs.writeFile(
  OUTPUT_FILE,
  output.join("\n"),
  "utf8"
);

console.log(`Generated ${selected.length} channels`);

const summary = {};

for (const item of selected) {
  const country = countryNames[item.country] ||
    (item.country === "INT" ? "International" : item.country);

  const key = `${country} | ${item.category}`;

  summary[key] = (summary[key] || 0) + 1;
}

console.table(summary);

const onTime = selected.filter(item =>
  item.country === "EG" &&
  hasKeyword(item.name, keywords.onTimeSports)
);

console.log(
  `OnTime Sports channels found: ${onTime.length}`
);

const beinXtra = selected.find(
  item => item.id === "beINSportsXTRA.int"
);

console.log(
  beinXtra
    ? "beIN SPORTS XTRA added successfully"
    : "beIN SPORTS XTRA not added: validation failed"
);

console.log(`Playlist saved: ${OUTPUT_FILE}`);
