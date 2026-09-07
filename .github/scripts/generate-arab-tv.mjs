import fs from "node:fs/promises";

const API = "https://iptv-org.github.io/api";

const [
  channels,
  streams,
  feeds,
  regions,
  logos
] = await Promise.all([
  fetchJson(`${API}/channels.json`),
  fetchJson(`${API}/streams.json`),
  fetchJson(`${API}/feeds.json`),
  fetchJson(`${API}/regions.json`),
  fetchJson(`${API}/logos.json`)
]);

function fetchJson(url) {
  return fetch(url).then(async response => {
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status}`);
    }

    return response.json();
  });
}

/*
 * Arab World
 *
 * IPTV-org maintains the Arab World region in regions.json.
 */
const arabRegion = regions.find(
  region => region.code?.toUpperCase() === "ARAB"
);

if (!arabRegion) {
  throw new Error("ARAB region was not found.");
}

const arabCountries = new Set(arabRegion.countries);

/*
 * Categories we want.
 */
const categories = new Set([
  "series",
  "sports",
  "kids",
  "movies"
]);

/*
 * Arabic language codes.
 */
const arabicLanguages = new Set([
  "ara",
  "arb",
  "ar"
]);

/*
 * Build lookup maps.
 */
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

/*
 * Only channels:
 * - from Arab World countries
 * - non-NSFW
 * - in our selected categories
 */
const selectedChannels = channels.filter(channel => {
  if (!arabCountries.has(channel.country)) {
    return false;
  }

  if (channel.is_nsfw) {
    return false;
  }

  return channel.categories?.some(category =>
    categories.has(category)
  );
});

/*
 * Map streams to channels.
 */
const streamsByChannel = new Map();

for (const stream of streams) {
  if (!stream.channel || !stream.url) continue;

  if (!streamsByChannel.has(stream.channel)) {
    streamsByChannel.set(stream.channel, []);
  }

  streamsByChannel.get(stream.channel).push(stream);
}

/*
 * Country names.
 */
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

/*
 * Determine the playlist category.
 */
function getPlaylistCategory(channel) {
  const channelCategories = channel.categories || [];
  const name = (channel.name || "").toLowerCase();

  // 1) Series always wins over Movies
  if (
    channelCategories.includes("series") ||
    name.includes("drama")
  ) {
    return "Series";
  }

  // 2) Sports
  if (channelCategories.includes("sports")) {
    return "Sports";
  }

  // 3) Kids
  if (channelCategories.includes("kids")) {
    return "Kids";
  }

  // 4) Movies
  if (channelCategories.includes("movies")) {

    // Known foreign-movie indicators
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

    if (foreignKeywords.some(keyword => name.includes(keyword))) {
      return "Foreign Movies";
    }

    // Known Arabic cinema brands / indicators
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

    // Fall back to feed language
    const channelStreams =
      streamsByChannel.get(channel.id) || [];

    for (const stream of channelStreams) {
      const feed = stream.feed
        ? feedMap.get(`${stream.channel}@${stream.feed}`)
        : null;

      if (!feed) continue;

      const languages = feed.languages || [];

      if (languages.some(lang => arabicLanguages.has(lang))) {
        return "Arabic Movies";
      }
    }

    return "Foreign Movies";
  }

  return null;
}

/*
 * Stream scoring.
 *
 * This is NOT a guarantee of Car TV compatibility.
 * It simply avoids obviously problematic streams where possible.
 */
function scoreStream(stream) {
  let score = 0;

  const title = `${stream.title || ""} ${stream.label || ""}`.toLowerCase();

  if (stream.label) {
    score -= 100;
  }

  if (title.includes("geo-blocked")) {
    score -= 100;
  }

  if (title.includes("offline")) {
    score -= 100;
  }

  if (stream.quality) {
    const match = stream.quality.match(/(\d{3,4})p/i);

    if (match) {
      const quality = Number(match[1]);

      /*
       * Prefer 720p/1080p.
       * Avoid excessively high streams for Car TV.
       */
      if (quality === 720) score += 30;
      else if (quality === 1080) score += 25;
      else if (quality === 576) score += 20;
      else if (quality === 480) score += 15;
      else if (quality > 1080) score -= 10;
    }
  }

  /*
   * HLS is generally the most common format for IPTV.
   */
  if (stream.url.includes(".m3u8")) {
    score += 20;
  }

  /*
   * Prefer streams without special request requirements.
   */
  if (!stream.referrer) {
    score += 10;
  }

  if (!stream.user_agent) {
    score += 5;
  }

  return score;
}

function selectBestStream(channel) {
  const available = streamsByChannel.get(channel.id) || [];

  if (!available.length) {
    return null;
  }

  return [...available]
    .sort((a, b) => scoreStream(b) - scoreStream(a))[0];
}

/*
 * Deduplicate by channel.
 */
const selected = [];

for (const channel of selectedChannels) {
  const category = getPlaylistCategory(channel);

  if (!category) continue;

  const stream = selectBestStream(channel);

  if (!stream) continue;

  selected.push({
    channel,
    stream,
    category
  });
}

/*
 * Sort:
 *
 * Country
 *   Category
 *     Channel
 */
selected.sort((a, b) => {
  const countryA = countryName(a.channel.country);
  const countryB = countryName(b.channel.country);

  if (countryA !== countryB) {
    return countryA.localeCompare(countryB);
  }

  if (a.category !== b.category) {
    return a.category.localeCompare(b.category);
  }

  return a.channel.name.localeCompare(b.channel.name);
});

/*
 * Generate M3U.
 */
const output = [];

output.push(
  '#EXTM3U x-tvg-url="https://raw.githubusercontent.com/StrangeDrVN/epg/public/output/guide.xml.gz"'
);

output.push(
  '# Generated automatically from IPTV-org API'
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

  const country = countryName(channel.country);

  const group = `${country} | ${category}`;

  if (group !== currentGroup) {
    currentGroup = group;

    output.push(`# === ${group} ===`);
  }

  const logo = logoMap.get(channel.id) || "";

  const groupEscaped = group.replace(/"/g, "'");

  const name = channel.name
    .replace(/\r?\n/g, " ")
    .trim();

  const attributes = [
    `tvg-id="${channel.id}"`,
    `tvg-name="${name.replace(/"/g, "'")}"`,
    logo ? `tvg-logo="${logo}"` : "",
    `group-title="${groupEscaped}"`
  ]
    .filter(Boolean)
    .join(" ");

  output.push(
    `#EXTINF:-1 ${attributes},${name}`
  );

  output.push(stream.url);

  output.push("");
}

/*
 * Write output.
 */
await fs.mkdir("playlists", { recursive: true });

await fs.writeFile(
  "playlists/arab-tv.m3u",
  output.join("\n"),
  "utf8"
);

console.log(
  `Generated ${selected.length} channels.`
);

const summary = {};

for (const item of selected) {
  const key =
    `${countryName(item.channel.country)} | ${item.category}`;

  summary[key] = (summary[key] || 0) + 1;
}

console.table(summary);
