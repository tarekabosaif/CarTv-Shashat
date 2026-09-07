import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const PLAYLIST_PATH = "playlists/arab-tv.m3u";
const REPORT_PATH = "playlists/compatibility-report.json";

const playlist = await fs.readFile(PLAYLIST_PATH, "utf8");

function parsePlaylist(text) {
  const lines = text.split(/\r?\n/);
  const channels = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (!line.startsWith("#EXTINF")) continue;

    const name = line.substring(line.lastIndexOf(",") + 1).trim();

    const idMatch = line.match(/tvg-id="([^"]*)"/i);
    const groupMatch = line.match(/group-title="([^"]*)"/i);

    let url = "";

    for (let j = i + 1; j < lines.length; j++) {
      const next = lines[j].trim();

      if (!next) continue;

      if (!next.startsWith("#")) {
        url = next;
        break;
      }
    }

    if (!url) continue;

    channels.push({
      id: idMatch?.[1] || "",
      name,
      group: groupMatch?.[1] || "",
      url
    });
  }

  return channels;
}

async function probeChannel(channel) {
  console.log(`Checking: ${channel.name}`);

  try {
    const { stdout } = await execFileAsync(
      "ffprobe",
      [
        "-v", "quiet",
        "-print_format", "json",
        "-show_streams",
        "-show_format",

        "-rw_timeout", "15000000",

        channel.url
      ],
      {
        timeout: 20000,
        maxBuffer: 1024 * 1024 * 10
      }
    );

    const data = JSON.parse(stdout);

    const videoStream = data.streams?.find(
      stream => stream.codec_type === "video"
    );

    const audioStreams = data.streams?.filter(
      stream => stream.codec_type === "audio"
    ) || [];

    const video = videoStream
      ? {
          codec: videoStream.codec_name || null,
          profile: videoStream.profile || null,
          width: videoStream.width || null,
          height: videoStream.height || null,
          fps: videoStream.avg_frame_rate || null
        }
      : null;

    const audio = audioStreams.map(stream => ({
      codec: stream.codec_name || null,
      profile: stream.profile || null,
      channels: stream.channels || null,
      sampleRate: stream.sample_rate || null,
      language: stream.tags?.language || null
    }));

    return {
      ...channel,
      online: true,
      video,
      audio,
      hasVideo: Boolean(videoStream),
      hasAudio: audioStreams.length > 0,
      checkedAt: new Date().toISOString()
    };

  } catch (error) {
    console.error(
      `Failed: ${channel.name} - ${error.message}`
    );

    return {
      ...channel,
      online: false,
      video: null,
      audio: [],
      hasVideo: false,
      hasAudio: false,
      error: error.message,
      checkedAt: new Date().toISOString()
    };
  }
}

const channels = parsePlaylist(playlist);

console.log(`Found ${channels.length} channels.`);

/*
 * نفحص مجموعة قنوات بالتوازي.
 * ده لتسريع GitHub Action فقط،
 * وليس لتقييد القنوات.
 */
const CONCURRENCY = 5;

const results = [];

for (let i = 0; i < channels.length; i += CONCURRENCY) {

  const batch = channels.slice(
    i,
    i + CONCURRENCY
  );

  const batchResults = await Promise.all(
    batch.map(probeChannel)
  );

  results.push(...batchResults);
}

const report = {
  generatedAt: new Date().toISOString(),
  totalChannels: results.length,

  online: results.filter(
    channel => channel.online
  ).length,

  offline: results.filter(
    channel => !channel.online
  ).length,

  withAudio: results.filter(
    channel => channel.hasAudio
  ).length,

  withoutAudio: results.filter(
    channel =>
      channel.online &&
      !channel.hasAudio
  ).length,

  channels: results
};

await fs.writeFile(
  REPORT_PATH,
  JSON.stringify(report, null, 2),
  "utf8"
);

console.log("");
console.log("==============================");
console.log("Compatibility report");
console.log("==============================");
console.log(`Total: ${report.totalChannels}`);
console.log(`Online: ${report.online}`);
console.log(`Offline/Error: ${report.offline}`);
console.log(`With audio: ${report.withAudio}`);
console.log(`Without audio: ${report.withoutAudio}`);
console.log("==============================");

console.log(
  `Report written to ${REPORT_PATH}`
);
