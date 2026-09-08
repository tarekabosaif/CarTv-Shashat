import fs from "node:fs/promises";

/* =========================================================
 * Theater VOD Catalog
 *
 * IMPORTANT:
 * - This is separate from Live TV.
 * - We do NOT extract direct HLS/media URLs from providers.
 * - We only store official/public provider links.
 * - Playback should use provider-supported playback.
 * ========================================================= */

const OUTPUT_FILE =
  "playlists/theater-vod.json";

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

/* =========================================================
 * Providers
 * ========================================================= */

const providers = {
  youtube: {
    id: "youtube",
    name: "YouTube",
    playbackType: "external",
    supportsEmbed: true
  },

  shahid: {
    id: "shahid",
    name: "Shahid",
    playbackType: "external",
    supportsEmbed: false
  }
};

/* =========================================================
 * Catalog
 *
 * Add only official/public provider links.
 * ========================================================= */

const items = [

  /* -------------------------------------------------------
   * Shahid - Plays catalog
   * ------------------------------------------------------- */

  {
    id: "shahid-plays",

    titleAr:
      "مسرحيات على شاهد",

    titleEn:
      "Shahid Plays",

    descriptionAr:
      "قسم المسرحيات الرسمي على منصة شاهد.",

    descriptionEn:
      "Official Shahid plays catalog.",

    type:
      "catalog",

    category:
      "Theater",

    country:
      "SA",

    language: [
      "ar"
    ],

    provider:
      "shahid",

    providerUrl:
      "https://shahid.mbc.net/ar/plays",

    thumbnail:
      null,

    year:
      null,

    featured:
      true,

    playableInsideApp:
      false
  },

  /* -------------------------------------------------------
   * Masrah Masr
   * Official verified YouTube channel
   * ------------------------------------------------------- */

  {
    id:
      "masrah-masr-social-media",

    titleAr:
      "مسرحية تواصل إجتماعي",

    titleEn:
      "Social Media - Masrah Masr",

    descriptionAr:
      "مسرحية من الموسم الأول من مسرح مصر.",

    descriptionEn:
      "Masrah Masr Season 1 theater performance.",

    type:
      "video",

    category:
      "Theater",

    subcategory:
      "Egyptian Plays",

    country:
      "EG",

    language: [
      "ar"
    ],

    provider:
      "youtube",

    youtubeVideoId:
      "A13oawDTK1c",

    providerUrl:
      "https://www.youtube.com/watch?v=A13oawDTK1c",

    embedUrl:
      "https://www.youtube.com/embed/A13oawDTK1c",

    thumbnail:
      "https://i.ytimg.com/vi/A13oawDTK1c/hqdefault.jpg",

    year:
      2024,

    featured:
      true,

    playableInsideApp:
      true
  },

  {
    id:
      "masrah-masr-al-moalef",

    titleAr:
      "مسرحية المؤلف",

    titleEn:
      "Al Moalef - Masrah Masr",

    descriptionAr:
      "مسرحية من الموسم الثالث من مسرح مصر.",

    descriptionEn:
      "Masrah Masr Season 3 theater performance.",

    type:
      "video",

    category:
      "Theater",

    subcategory:
      "Egyptian Plays",

    country:
      "EG",

    language: [
      "ar"
    ],

    provider:
      "youtube",

    youtubeVideoId:
      "kINc-OuhUJk",

    providerUrl:
      "https://www.youtube.com/watch?v=kINc-OuhUJk",

    embedUrl:
      "https://www.youtube.com/embed/kINc-OuhUJk",

    thumbnail:
      "https://i.ytimg.com/vi/kINc-OuhUJk/hqdefault.jpg",

    year:
      2024,

    featured:
      false,

    playableInsideApp:
      true
  },

  {
    id:
      "masrah-masr-season-3",

    titleAr:
      "مسرح مصر - الموسم الثالث كامل",

    titleEn:
      "Masrah Masr - Season 3 Full",

    descriptionAr:
      "الموسم الثالث كامل ويحتوي على مجموعة كبيرة من المسرحيات.",

    descriptionEn:
      "Full Masrah Masr season 3 collection.",

    type:
      "collection",

    category:
      "Theater",

    subcategory:
      "Egyptian Plays",

    country:
      "EG",

    language: [
      "ar"
    ],

    provider:
      "youtube",

    youtubeVideoId:
      "kOikhCWCJd0",

    providerUrl:
      "https://www.youtube.com/watch?v=kOikhCWCJd0",

    embedUrl:
      "https://www.youtube.com/embed/kOikhCWCJd0",

    thumbnail:
      "https://i.ytimg.com/vi/kOikhCWCJd0/hqdefault.jpg",

    year:
      2025,

    featured:
      true,

    playableInsideApp:
      true
  }
];

/* =========================================================
 * Validation
 * ========================================================= */

function validateItem(item) {

  if (!item.id) {
    throw new Error(
      "Theater VOD item is missing id."
    );
  }

  if (!item.titleAr) {
    throw new Error(
      `Item ${item.id} is missing titleAr.`
    );
  }

  if (!item.provider) {
    throw new Error(
      `Item ${item.id} is missing provider.`
    );
  }

  if (
    !providers[item.provider]
  ) {
    throw new Error(
      `Unknown provider "${item.provider}" in ${item.id}.`
    );
  }

  if (
    !countryNames[item.country]
  ) {
    throw new Error(
      `Country "${item.country}" is not allowed in ${item.id}.`
    );
  }

  if (!item.providerUrl) {
    throw new Error(
      `Item ${item.id} is missing providerUrl.`
    );
  }

  if (
    item.provider === "youtube" &&
    !item.youtubeVideoId
  ) {
    throw new Error(
      `YouTube item ${item.id} is missing youtubeVideoId.`
    );
  }
}

for (
  const item
  of items
) {
  validateItem(item);
}

/* =========================================================
 * Deduplicate
 * ========================================================= */

const seenIds =
  new Set();

const seenUrls =
  new Set();

const finalItems = [];

for (
  const item
  of items
) {

  if (
    seenIds.has(
      item.id
    )
  ) {
    console.warn(
      `Duplicate ID skipped: ${item.id}`
    );

    continue;
  }

  if (
    seenUrls.has(
      item.providerUrl
    )
  ) {
    console.warn(
      `Duplicate URL skipped: ${item.providerUrl}`
    );

    continue;
  }

  seenIds.add(
    item.id
  );

  seenUrls.add(
    item.providerUrl
  );

  finalItems.push(
    item
  );
}

/* =========================================================
 * Sort
 * ========================================================= */

finalItems.sort(
  (a, b) => {

    if (
      a.featured !==
      b.featured
    ) {
      return (
        Number(b.featured) -
        Number(a.featured)
      );
    }

    return String(
      a.titleAr
    ).localeCompare(
      String(
        b.titleAr
      ),
      "ar"
    );
  }
);

/* =========================================================
 * Output
 * ========================================================= */

const output = {

  version: 1,

  type:
    "theater-vod",

  generatedAt:
    new Date()
      .toISOString(),

  playbackPolicy: {

    description:
      "Use provider-supported playback only.",

    directStreamExtraction:
      false,

    allowExternalProvider:
      true,

    allowYouTubeEmbed:
      true
  },

  countries:
    countryNames,

  providers,

  categories: [
    {
      id:
        "egyptian-plays",

      titleAr:
        "مسرحيات مصرية",

      titleEn:
        "Egyptian Plays"
    },

    {
      id:
        "arabic-plays",

      titleAr:
        "مسرحيات عربية",

      titleEn:
        "Arabic Plays"
    },

    {
      id:
        "masrah-masr",

      titleAr:
        "مسرح مصر",

      titleEn:
        "Masrah Masr"
    }
  ],

  count:
    finalItems.length,

  items:
    finalItems
};

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
  OUTPUT_FILE,
  JSON.stringify(
    output,
    null,
    2
  ),
  "utf8"
);

console.log("");
console.log(
  "================================="
);

console.log(
  "Theater VOD"
);

console.log(
  "================================="
);

console.log(
  `✅ Generated ${finalItems.length} VOD entries`
);

console.log(
  `✅ Output: ${OUTPUT_FILE}`
);

console.log(
  "✅ Live TV remains separate"
);

console.log(
  "✅ No direct Shahid stream extraction"
);

console.log(
  "✅ No YouTube stream extraction"
);

console.log(
  "✅ Provider URLs only"
);

console.log(
  "================================="
);
