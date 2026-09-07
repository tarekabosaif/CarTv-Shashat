import fs from "node:fs/promises";

const API = "https://iptv-org.github.io/api";
const FREE_TV_URL =
  "https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8";

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

async function fetchJson(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  return response.json();
}

async function fetchText(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  return response.text();
}

/* =========================================================
 * Arab World countries
 * ========================================================= */

const arabRegion = regions.find(
  region => region.code?.toUpperCase() === "ARAB"
);

if (!arabRegion) {
  throw new Error("ARAB region was not found.");
}

const arabCountries = new Set(arabRegion.countries);

/* =========================================================
 * Categories
 * ========================================================= */

const categories = new Set([
  "series",
  "sports",
  "kids",
  "movies",
  "religious"
]);

const arabicLanguages = new Set([
  "ara",
  "arb",
  "ar"
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
 * Playlist category
 * ========================================================= */

function getPlaylistCategory(channel) {
  const channelCategories = channel.categories || [];
  const name = (channel.name || "").toLowerCase();

  const quranKeywords = [
    "quran",
    "qur'an",
    "koran",
    "قرآن",
    "القرآن",
    "holy quran",
    "quran kareem"
  ];

  if (
    channelCategories.includes("religious") &&
    ["EG", "SA"].includes(channel.country) &&
    quranKeywords.some(keyword => name.includes(keyword))
  ) {
    return "Quran";
  }

  if (
    channelCategories.includes("series") ||
    name.includes("drama")
  ) {
    return "Series";
  }

  if (channelCategories.includes("sports")) {
    return "Sports";
  }

  if (channelCategories.includes("kids")) {
    return "Kids";
  }

  if (channelCategories.includes("movies")) {

    const foreignKeywords = [
      "hollywood",
      "bollywood",
      "action",
      "thriller",
      "english",
      "hindi",
      "osn movies"
    ];

    if (foreignKeywords.some(keyword => name.includes(keyword))) {
      return "Foreign Movies";
    }

    const arabicKeywords = [
      "rotana cinema",
      "aflam",
      "cinema masr",
      "arabic",
      "masr"
    ];

    if (arabicKeywords.some(keyword => name.includes(keyword))) {
      return "Arabic Movies";
    }

    const channelStreams =
      streamsByChannel.get(channel.id) || [];

    for (const stream of channelStreams) {
      const feed = stream.feed
        ? feedMap.get(`${stream.channel}@${stream.feed}`)
        : null;

      if (!feed) continue;

      const languages = feed.languages || [];

      if (
        languages.some(lang =>
          arabicLanguages.has(lang)
        )
      ) {
        return "Arabic Movies";
      }
    }

    return "Foreign Movies";
  }

  return null;
}

/* =========================================================
 * Stream scoring
 * ========================================================= */

function scoreStream(stream) {
  let score = 0;

  const text =
    `${stream.title || ""} ${stream.label || ""}`.toLowerCase();

  if (text.includes("offline")) {
    score -= 1000;
  }

  if (text.includes("geo-blocked")) {
    score -= 50;
  }

  if (stream.url?.includes(".m3u8")) {
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
      stream.quality.match(/(\d{3,4})p/i);

    if (match) {
      const quality = Number(match[1]);

      if (quality === 720) score += 40;
      else if (quality === 1080) score += 35;
      else if (quality === 576) score += 25;
      else if (quality === 480) score += 20;
      else if (quality > 1080) score -= 10;
    }
  }

  return score;
}

function selectBestStream(channel) {
  const available =
    streamsByChannel.get(channel.id) || [];

  if (!available.length) {
    return null;
  }

  return [...available].sort(
    (a, b) =>
      scoreStream(b) - scoreStream(a)
  )[0];
}

/* =========================================================
 * IPTV-org selection
 * ========================================================= */

const selected = [];

for (const channel of channels) {

  if (!arabCountries.has(channel.country)) {
    continue;
  }

  if (channel.is_nsfw) {
    continue;
  }

  const isEgypt = channel.country === "EG";

const isWantedCategory =
  channel.categories?.some(category =>
    categories.has(category)
  );

if (!isEgypt && !isWantedCategory) {
  continue;
}

  let category =
  getPlaylistCategory(channel);

// Don't discard Egyptian channels just because
// IPTV-org classified them as general/news/etc.
if (!category && channel.country === "EG") {
  category = "Egypt TV";
}

if (!category) continue;

  const stream =
    selectBestStream(channel);

  if (!stream) continue;

  selected.push({
    channel,
    stream,
    category,
    source: "IPTV-org"
  });
}

/* =========================================================
 * Parse Free-TV M3U
 * ========================================================= */

function parseM3U(text) {
  const lines =
    text.split(/\r?\n/);

  const result = [];

  for (let i = 0; i < lines.length; i++) {

    const line = lines[i].trim();

    if (!line.startsWith("#EXTINF")) {
      continue;
    }

    let url = "";

    for (
      let j = i + 1;
      j < lines.length;
      j++
    ) {
      const next = lines[j].trim();

      if (!next) continue;

      if (!next.startsWith("#")) {
        url = next;
        break;
      }
    }

    if (!url) continue;

    const name =
      line.includes(",")
        ? line.substring(
            line.lastIndexOf(",") + 1
          ).trim()
        : "Unknown";

    const groupMatch =
      line.match(/group-title="([^"]+)"/i);

    const idMatch =
      line.match(/tvg-id="([^"]*)"/i);

    const logoMatch =
      line.match(/tvg-logo="([^"]*)"/i);

    result.push({
      name,
      url,
      group:
        groupMatch?.[1] || "",
      tvgId:
        idMatch?.[1] || "",
      logo:
        logoMatch?.[1] || ""
    });
  }

  return result;
}

const freeTvChannels =
  parseM3U(freeTvText);

/* =========================================================
 * Egypt enrichment
 * ========================================================= */

/*
 * These are useful Egyptian channels that may not be
 * classified by IPTV-org under our selected categories.
 */

const egyptWanted = [
  "mbc masr",
  "mbc masr 1",
  "mbc masr 2",
  "alhayat",
  "al hayat",
  "al qahera news",
  "cairo news",
  "cbc",
  "cbc drama",
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
  "watan tv"
];

function normalizeName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function isWantedEgyptChannel(name) {

  const normalized =
    normalizeName(name);

  return egyptWanted.some(
    wanted =>
      normalized.includes(
        normalizeName(wanted)
      )
  );
}

function classifyEgyptChannel(name) {

  const n =
    normalizeName(name);

  if (
    n.includes("koogi") ||
    n.includes("kids")
  ) {
    return "Kids";
  }

  if (
    n.includes("drama") ||
    n.includes("مسلسلات")
  ) {
    return "Series";
  }

  if (
    n.includes("hollywood") ||
    n.includes("action") ||
    n.includes("thriller") ||
    n.includes("bollywood")
  ) {
    return "Foreign Movies";
  }

  if (
    n.includes("rotana cinema") ||
    n.includes("cinema") ||
    n.includes("aflam")
  ) {
    return "Arabic Movies";
  }

  /*
   * General Egyptian channels that don't fit one
   * of our old categories.
   */
  return "Egypt TV";
}

/* =========================================================
 * Dedupe helpers
 * ========================================================= */

function channelKey(name) {
  return normalizeName(name)
    .replace(/\bhd\b/g, "")
    .replace(/\bsd\b/g, "")
    .trim();
}

const existingNames =
  new Set(
    selected.map(item =>
      channelKey(
        item.channel.name
      )
    )
  );

/* =========================================================
 * Add Egypt channels from Free-TV
 * ========================================================= */

for (const item of freeTvChannels) {

  const group =
    normalizeName(item.group);

  /*
   * Free-TV uses country groups.
   */
  const isEgypt =
    group === "egypt" ||
    group.includes("egypt");

  if (!isEgypt) {
    continue;
  }

  if (
    !isWantedEgyptChannel(item.name)
  ) {
    continue;
  }

  const key =
    channelKey(item.name);

  if (existingNames.has(key)) {
    continue;
  }

  existingNames.add(key);

  selected.push({
    channel: {
      id:
        item.tvgId ||
        `FreeTV.${key.replace(/\s+/g, "")}.eg`,
      name: item.name,
      country: "EG"
    },

    stream: {
      url: item.url
    },

    category:
      classifyEgyptChannel(
        item.name
      ),

    logo: item.logo,

    source: "Free-TV"
  });
}

/* =========================================================
 * Sorting
 * ========================================================= */

const categoryOrder = {
  Quran: 1,
  Kids: 2,
  Series: 3,
  "Arabic Movies": 4,
  "Foreign Movies": 5,
  Sports: 6,
  "Egypt TV": 7
};

selected.sort((a, b) => {

  const countryA =
    countryName(a.channel.country);

  const countryB =
    countryName(b.channel.country);

  if (countryA !== countryB) {
    return countryA.localeCompare(countryB);
  }

  const orderA =
    categoryOrder[a.category] ?? 99;

  const orderB =
    categoryOrder[b.category] ?? 99;

  if (orderA !== orderB) {
    return orderA - orderB;
  }

  return a.channel.name.localeCompare(
    b.channel.name
  );
});

/* =========================================================
 * Generate M3U
 * ========================================================= */

const output = [];

output.push(
  '#EXTM3U x-tvg-url="https://raw.githubusercontent.com/StrangeDrVN/epg/public/output/guide.xml.gz"'
);

output.push(
  "# Generated automatically from IPTV-org + Free-TV"
);

output.push(
  `# Generated: ${new Date().toISOString()}`
);

output.push("");

let currentGroup = null;

for (const item of selected) {

  const {
    channel,
    stream,
    category
  } = item;

  const country =
    countryName(channel.country);

  const group =
    `${country} | ${category}`;

  if (group !== currentGroup) {

    currentGroup = group;

    output.push(
      `# === ${group} ===`
    );
  }

  const logo =
    item.logo ||
    logoMap.get(channel.id) ||
    "";

  const name =
    channel.name
      .replace(/\r?\n/g, " ")
      .trim();

  const safeName =
    name.replace(/"/g, "'");

  const safeGroup =
    group.replace(/"/g, "'");

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
 * Write file
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

console.log(
  `Generated ${selected.length} channels.`
);

const summary = {};

for (const item of selected) {

  const key =
    `${countryName(
      item.channel.country
    )} | ${item.category}`;

  summary[key] =
    (summary[key] || 0) + 1;
}

console.table(summary);
