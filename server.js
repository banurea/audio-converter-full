require("dotenv").config();

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const fsp = fs.promises;
const { spawn } = require("child_process");
const { nanoid } = require("nanoid");
const { resolveExecutableCommand } = require("./lib/command-resolver");
const {
  buildYtDlpArgs,
  getFriendlyYoutubeError,
} = require("./lib/yt-dlp-helpers");
const {
  loadRobloxSettings,
  saveRobloxSettings,
  resolveRobloxSettings,
} = require("./lib/roblox-settings");

const app = express();

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const TMP_DIR = path.join(ROOT, "tmp");
const OUT_DIR = path.join(ROOT, "downloads");
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB || 150);
const PUBLIC_BASE_URL = (
  process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`
).replace(/\/$/, "");

fs.mkdirSync(TMP_DIR, { recursive: true });
fs.mkdirSync(OUT_DIR, { recursive: true });

const localYtdlp = path.join(ROOT, "yt-dlp");
if (process.platform !== "win32" && fs.existsSync(localYtdlp)) {
  try {
    fs.chmodSync(localYtdlp, 0o755);
  } catch (_) {}
}

loadRobloxSettings({ rootDir: ROOT });

const upload = multer({
  dest: TMP_DIR,
  limits: {
    fileSize: MAX_UPLOAD_MB * 1024 * 1024,
  },
});

app.use(cors());
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(ROOT, "public")));
app.use("/downloads", express.static(OUT_DIR));

function bin(name) {
  const resolved = resolveExecutableCommand(name, {
    rootDir: ROOT,
    platform: process.platform,
  });
  return resolved.command;
}

function resolveCookiesFile() {
  // Support providing raw cookies file content via environment variable.
  // This is useful on platforms like Render where you can set a secret
  // and write it to disk at runtime instead of committing a cookies file.
  const cookiesContent = process.env.YT_DLP_COOKIES_CONTENT;
  if (cookiesContent) {
    try {
      const dest = path.join(TMP_DIR, "cookies.txt");
      // only write when missing or changed
      if (
        !fs.existsSync(dest) ||
        fs.readFileSync(dest, "utf8") !== cookiesContent
      ) {
        fs.writeFileSync(dest, cookiesContent, { mode: 0o600 });
      }
      return dest;
    } catch (_) {}
  }

  const candidates = [
    process.env.YT_DLP_COOKIES_FILE,
    process.env.COOKIES_FILE,
    path.join(ROOT, "cookies.txt"),
    "/app/cookies.txt",
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch (_) {}
  }

  return "";
}

function runYtDlp(url, args = [], options = {}) {
  const nodeExecutable = process.env.NODE || process.execPath;
  const cookiesFile = resolveCookiesFile();
  const ytArgs = buildYtDlpArgs({
    url,
    extraArgs: args,
    nodeExecutable,
    cookiesFile,
  });
  return run(bin("yt-dlp"), ytArgs, options);
}

function run(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      ...options,
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (d) => {
      stdout += d.toString();
    });

    child.stderr?.on("data", (d) => {
      stderr += d.toString();
    });

    child.on("error", (err) => {
      if (err && err.code === "ENOENT") {
        reject(
          new Error(
            `Tidak bisa menjalankan "${cmd}". Pastikan executable tersedia di PATH atau proyek memiliki file yang bisa dieksekusi.`,
          ),
        );
      } else {
        reject(err);
      }
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(
          new Error(`${cmd} exited with code ${code}\n${stderr || stdout}`),
        );
      }
    });
  });
}

function isSpotifyUrl(url) {
  return /^https?:\/\/(open\.)?spotify\.com\//i.test(String(url || ""));
}

function isYoutubeUrl(url) {
  return /^https?:\/\/(www\.)?(youtube\.com|youtu\.be|music\.youtube\.com)\//i.test(
    String(url || ""),
  );
}

function isSoundCloudUrl(url) {
  return /^https?:\/\/(www\.|m\.)?soundcloud\.com\//i.test(String(url || ""));
}

function isTiktokUrl(url) {
  return /^https?:\/\/(www\.)?(tiktok\.com|vm\.tiktok\.com)\//i.test(
    String(url || ""),
  );
}

function makeShortSoundCloudTitle(url) {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/").filter(Boolean);
    let slug = parts[parts.length - 1] || parts[0] || "audio";
    slug = slug.replace(/[^a-zA-Z0-9]+/g, " ").trim();
    if (!slug) slug = "audio";
    const words = slug.split(/\s+/).filter(Boolean).slice(0, 3);
    const title = words.join(" ") || "audio";
    return normalizeTitle(title, 3);
  } catch (err) {
    return normalizeTitle("audio", 3);
  }
}

function extractSpotifyTrackId(url) {
  const match = String(url || "").match(/spotify\.com\/track\/([A-Za-z0-9]+)/i);
  return match ? match[1] : null;
}

async function getSpotifyAccessToken() {
  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!id || !secret) return null;

  const basic = Buffer.from(`${id}:${secret}`).toString("base64");

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    throw new Error(
      "Login Spotify API gagal. Cek SPOTIFY_CLIENT_ID dan SPOTIFY_CLIENT_SECRET di .env.",
    );
  }

  const data = await res.json();
  return data.access_token;
}

async function getSpotifyEmbed(url) {
  const api = `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`;

  const res = await fetch(api);

  if (!res.ok) {
    throw new Error("Tidak bisa membaca metadata Spotify.");
  }

  return res.json();
}

async function fetchYoutubeOEmbedTitle(url) {
  try {
    const api = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    const res = await fetch(api);
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    return data && data.title ? String(data.title).trim() : null;
  } catch (err) {
    return null;
  }
}

function looksLikeVideoId(str) {
  if (!str) return false;
  const s = String(str).trim();
  // YouTube video IDs are usually 11 chars of A-Za-z0-9_- but tolerate 6-15
  return /^[A-Za-z0-9_-]{6,15}$/.test(s);
}

async function getSpotifyTrackInfo(url) {
  const trackId = extractSpotifyTrackId(url);

  if (!trackId) {
    throw new Error(
      "Hanya link Spotify track yang didukung, bukan album/playlist.",
    );
  }

  const token = await getSpotifyAccessToken();

  if (!token) {
    const embed = await getSpotifyEmbed(url);

    return {
      provider: "Spotify",
      title: embed.title || "Spotify audio",
      thumbnail: embed.thumbnail_url || "",
      previewUrl: null,
      note: "Metadata terbaca. Untuk convert preview resmi Spotify, isi SPOTIFY_CLIENT_ID dan SPOTIFY_CLIENT_SECRET di file .env.",
    };
  }

  const res = await fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    throw new Error("Tidak bisa membaca track dari Spotify API.");
  }

  const data = await res.json();
  const artist = (data.artists || []).map((a) => a.name).join(", ");

  return {
    provider: "Spotify",
    title: `${artist ? artist + " - " : ""}${data.name || "Spotify audio"}`,
    thumbnail: data.album?.images?.[0]?.url || "",
    duration: data.duration_ms ? Math.round(data.duration_ms / 1000) : null,
    previewUrl: data.preview_url || null,
    note: data.preview_url
      ? "Preview resmi Spotify tersedia. Yang bisa dikonversi hanya preview pendek, bukan lagu penuh."
      : "Spotify API tidak menyediakan file audio penuh. Track ini juga tidak punya preview_url, jadi upload file audio milikmu untuk convert penuh.",
  };
}

async function downloadToFile(url, outputPath) {
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error("Gagal download audio preview.");
  }

  const buf = Buffer.from(await res.arrayBuffer());
  await fsp.writeFile(outputPath, buf);
}

const BAD_TITLE_WORDS = [
  "anjing",
  "bangsat",
  "bajingan",
  "kontol",
  "perek",
  "puki",
  "jancok",
  "ngentot",
  "tai",
  "taik",
  "memek",
  "vagina",
  "titit",
  "asw",
  "babi",
  "gila",
  "brengsek",
  "setan",
  "bajing",
  "pepek",
  "meki",
  "ngewe",
  "kntl",
];

const SAFE_TITLE_FALLBACKS = [
  "audio",
  "youtube audio",
  "spotify audio",
  "soundcloud audio",
  "url audio",
];

function sanitizeName(name) {
  return (
    String(name || "audio")
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80) || "audio"
  );
}

function isBadTitle(name) {
  const normalized = String(name || "").toLowerCase();
  return BAD_TITLE_WORDS.some((bad) => normalized.includes(bad));
}

function normalizeTitle(name, maxWords = 3) {
  const cleaned = sanitizeName(name);
  if (!cleaned || SAFE_TITLE_FALLBACKS.includes(cleaned.toLowerCase())) {
    return "audio";
  }

  const words = cleaned.split(/\s+/).filter(Boolean).slice(0, maxWords);
  const title = words.join(" ") || "audio";
  return isBadTitle(title) ? "audio" : title;
}

function makeShortBase(name, maxLen = 60) {
  // create a filename-friendly base from a title but keep more of the original
  const clean = sanitizeName(name).replace(/\s+/g, "-");
  const safeLen = Math.max(32, Math.min(120, maxLen));
  const trimmed = clean.slice(0, safeLen).replace(/(^-+|-+$)/g, "");
  return trimmed || `audio`;
}

function makeDisplayTitle(name, maxLen = 120) {
  // Preserve the original (sanitized) title for display; allow longer defaults
  const clean = sanitizeName(name).slice(0, maxLen);
  return clean;
}

function makeUniqueFileName(base, ext = ".ogg") {
  const safeBase =
    String(base || "audio")
      .replace(/[^a-zA-Z0-9_-]/g, "")
      .replace(/^[\-_.]+|[\-_.]+$/g, "") || "audio";
  let candidate = `${safeBase}${ext}`;
  let counter = 1;
  while (fs.existsSync(path.join(OUT_DIR, candidate))) {
    candidate = `${safeBase}-${counter}${ext}`;
    counter += 1;
    if (counter > 1000) break;
  }
  return candidate;
}

async function hasAudioStream(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return false;

  try {
    const probe = await run(bin("ffprobe"), [
      "-v",
      "error",
      "-select_streams",
      "a",
      "-show_entries",
      "stream=index",
      "-of",
      "csv=p=0",
      filePath,
    ]).catch(() => ({ stdout: "" }));

    return Boolean(String(probe.stdout || "").trim());
  } catch (err) {
    return false;
  }
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceBadWords(value) {
  let text = String(value || "");
  for (const bad of BAD_TITLE_WORDS) {
    text = text.replace(new RegExp(`\\b${escapeRegExp(bad)}\\b`, "gi"), "");
  }
  return text.replace(/\s+/g, " ").trim();
}

function sanitizeRobloxText(
  value,
  maxLen = 250,
  defaultValue = "Uploaded automatically",
) {
  let text = String(value || "");

  // replace known bad words first
  text = replaceBadWords(text);

  // strip HTML tags
  text = text.replace(/<[^>]*>/g, "");

  // remove control chars and characters that could form paths
  text = text.replace(/[<>:\"/\\|?*\x00-\x1F]/g, "");

  // remove URLs to avoid embedding links that could bypass filters
  text = text.replace(/https?:\/\/\S+/gi, "").replace(/\bwww\.\S+\b/gi, "");

  // allow only safe common punctuation and basic characters
  text = text.replace(/[^a-zA-Z0-9 \-\_\.\,\!\?\:\'\"()]/g, "");

  text = text.replace(/\s+/g, " ").trim().slice(0, maxLen);

  if (!text) return defaultValue;

  // avoid returning strings that mention Roblox APIs or domains
  const lower = text.toLowerCase();
  if (lower.includes("roblox.com") || lower.includes("apis.roblox.com"))
    return defaultValue;

  return text;
}

function sanitizeRobloxName(name) {
  const cleaned = sanitizeRobloxText(name, 50, "audio");
  // ensure very short safe fallback and avoid reserved replacement token
  return cleaned === "baik" || !cleaned ? "audio" : cleaned;
}

function atempoChain(speed) {
  let s = Math.max(0.25, Math.min(4, Number(speed) || 1));
  const parts = [];

  while (s > 2) {
    parts.push("atempo=2");
    s /= 2;
  }

  while (s < 0.5) {
    parts.push("atempo=0.5");
    s /= 0.5;
  }

  parts.push(`atempo=${s.toFixed(5)}`);

  return parts;
}

function makeCleanAudioFilter({
  speed,
  pitchMode,
  gainDb,
  normalize,
  cleanMaster,
}) {
  const s = Math.max(0.25, Math.min(4, Number(speed) || 1));
  const g = Math.max(-20, Math.min(20, Number(gainDb) || 0));

  const filters = [];

  filters.push("highpass=f=30");
  filters.push("lowpass=f=19500");

  if (Math.abs(s - 1) > 0.001) {
    if (pitchMode === "chipmunk") {
      filters.push(`asetrate=${Math.round(48000 * s)}`);
      filters.push("aresample=48000:resampler=soxr:precision=28");
    } else {
      filters.push(...atempoChain(s));
    }
  } else {
    filters.push("aresample=48000:resampler=soxr:precision=28");
  }

  if (Math.abs(g) > 0.001) {
    filters.push(`volume=${g.toFixed(2)}dB`);
  }

  if (cleanMaster === "on") {
    filters.push("afftdn=nr=8:nf=-25");
    filters.push(
      "acompressor=threshold=-14dB:ratio=2.2:attack=12:release=120:makeup=1",
    );
  }

  filters.push("alimiter=limit=0.88:level=disabled");

  if (normalize === "on") {
    filters.push("dynaudnorm=f=150:g=9:p=0.90:m=12");
    filters.push("alimiter=limit=0.90:level=disabled");
  }

  return filters.join(",");
}

async function cleanup(filePath) {
  if (!filePath) return;

  try {
    await fsp.unlink(filePath);
  } catch (_) {}
}

/**
 * =========================
 * ROBLOX UPLOAD
 * =========================
 */

function assertRobloxConfig(settings) {
  if (!settings || !settings.uploadUrl) {
    throw new Error(
      "ROBLOX_UPLOAD_URL belum diisi di .env atau settings Roblox Anda.",
    );
  }

  if (!settings.apiKey) {
    throw new Error(
      "ROBLOX_API_KEY belum diisi di .env atau settings Roblox Anda.",
    );
  }

  if (!settings.creatorId) {
    throw new Error(
      "ROBLOX_CREATOR_ID belum diisi di .env atau settings Roblox Anda.",
    );
  }
}

function getRobloxCreator(settings) {
  const creatorType = String(settings.creatorType || "user").toLowerCase();
  const creatorId = String(settings.creatorId || "").trim();

  if (!creatorId) {
    throw new Error(
      "ROBLOX_CREATOR_ID belum diisi di .env atau settings Roblox Anda.",
    );
  }

  if (creatorType === "group") {
    return {
      groupId: creatorId,
    };
  }

  return {
    userId: creatorId,
  };
}

function getRobloxOperationUrl(operation) {
  const raw =
    operation?.path ||
    operation?.name ||
    operation?.operationId ||
    operation?.id;

  if (!raw) return null;

  const value = String(raw);

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  if (value.startsWith("cloud/")) {
    return `https://apis.roblox.com/${value}`;
  }

  if (value.startsWith("operations/") || value.includes("/operations/")) {
    return `https://apis.roblox.com/assets/v1/${value.replace(/^\/+/, "")}`;
  }

  return `https://apis.roblox.com/assets/v1/operations/${encodeURIComponent(value)}`;
}

function parseJsonValue(value) {
  if (typeof value !== "string") {
    return value || {};
  }

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (_) {
    return {};
  }
}

function extractRobloxSettingsFromRequest(req) {
  const body = req.body || {};
  const payload = body.robloxSettings
    ? parseJsonValue(body.robloxSettings)
    : body;

  return {
    apiKey: payload.robloxApiKey ?? payload.apiKey ?? "",
    creatorId: payload.robloxCreatorId ?? payload.creatorId ?? "",
    creatorType: payload.robloxCreatorType ?? payload.creatorType ?? "user",
    uploadUrl: payload.robloxUploadUrl ?? payload.uploadUrl ?? "",
    setPermissionUrl:
      payload.robloxPermissionUrl ?? payload.setPermissionUrl ?? "",
  };
}

async function pollRobloxOperation(operation, settings = {}) {
  const resolved = resolveRobloxSettings(settings, { rootDir: ROOT });
  const apiKey = resolved.apiKey;
  const operationUrl = getRobloxOperationUrl(operation);

  if (!operationUrl) {
    return operation;
  }

  for (let i = 0; i < 30; i++) {
    const res = await fetch(operationUrl, {
      method: "GET",
      headers: {
        "x-api-key": apiKey,
      },
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(
        `Gagal cek status upload Roblox: ${JSON.stringify(data)}`,
      );
    }

    if (data.done) {
      return data;
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  throw new Error(
    "Upload Roblox masih diproses terlalu lama. Coba cek asset di Creator Dashboard.",
  );
}

function extractRobloxAssetId(data) {
  return (
    data?.response?.assetId ||
    data?.response?.asset?.assetId ||
    data?.response?.asset?.id ||
    data?.assetId ||
    data?.asset?.assetId ||
    data?.asset?.id ||
    null
  );
}

function getAudioMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".ogg") return "audio/ogg";
  if (ext === ".mp3") return "audio/mpeg";
  if (ext === ".wav") return "audio/wav";
  if (ext === ".flac") return "audio/flac";

  return "application/octet-stream";
}

async function uploadAudioToRoblox(
  filePath,
  displayName,
  description = "",
  robloxSettings = {},
) {
  const settings = resolveRobloxSettings(robloxSettings, { rootDir: ROOT });
  assertRobloxConfig(settings);

  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error("File untuk upload Roblox tidak ditemukan.");
  }

  if (path.extname(filePath).toLowerCase() !== ".ogg") {
    throw new Error("Hanya file OGG yang didukung untuk upload Roblox.");
  }

  const uploadUrl = settings.uploadUrl.replace(/\/$/, "");
  const apiKey = settings.apiKey;

  const stats = await fsp.stat(filePath);

  if (stats.size >= 20 * 1024 * 1024) {
    throw new Error(
      "File terlalu besar untuk Roblox audio. Maksimal kurang dari 20 MB.",
    );
  }

  const requestPayload = {
    assetType: "Audio",
    // sanitize again here to ensure display name and description are safe
    displayName: sanitizeRobloxName(displayName),
    description: sanitizeRobloxText(description, 250, "Uploaded automatically"),
    creationContext: {
      creator: getRobloxCreator(settings),
    },
  };

  const audioBuffer = await fsp.readFile(filePath);

  const form = new FormData();

  form.append("request", JSON.stringify(requestPayload));
  form.append(
    "fileContent",
    new Blob([audioBuffer], {
      type: getAudioMimeType(filePath),
    }),
    path.basename(filePath),
  );

  const res = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
    },
    body: form,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(`Upload Roblox gagal: ${JSON.stringify(data)}`);
  }

  const finalOperation = data.done
    ? data
    : await pollRobloxOperation(data, settings);

  const assetId =
    extractRobloxAssetId(finalOperation) || extractRobloxAssetId(data);

  return {
    ok: true,
    assetId,
    robloxAssetUrl: assetId
      ? `https://create.roblox.com/store/asset/${assetId}`
      : null,
    operation: finalOperation,
  };
}

async function setRobloxPermissions(assetId, userIds, robloxSettings = {}) {
  if (!assetId || !userIds || !userIds.length)
    return { ok: false, error: "No assetId or userIds" };
  const settings = resolveRobloxSettings(robloxSettings, { rootDir: ROOT });
  const permUrlTemplate = settings.setPermissionUrl; // e.g. https://apis.roblox.com/assets/v1/assets/{assetId}/permissions
  const apiKey = settings.apiKey;

  if (!permUrlTemplate)
    return { ok: false, error: "ROBLOX_SET_PERMISSION_URL not configured" };

  const url = permUrlTemplate.replace(
    "{assetId}",
    encodeURIComponent(String(assetId)),
  );

  // Try batch request first: send all userIds in one body
  // sanitize and validate incoming userIds: allow only numeric ids, limit count
  const filteredIds = (
    Array.isArray(userIds) ? userIds : String(userIds).split(/\s*,\s*/)
  )
    .map((u) => String(u).trim())
    .filter(Boolean)
    .filter((u) => /^\d+$/.test(u))
    .slice(0, 50);

  if (!filteredIds.length)
    return { ok: false, error: "No valid numeric userIds provided" };

  try {
    const batchRes = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({ userIds: filteredIds.map((u) => String(u)) }),
    });

    const batchData = await batchRes.json().catch(() => ({}));
    if (batchRes.ok) {
      return { ok: true, batch: true, results: batchData };
    }
    // if not ok, fallthrough to per-user attempts
  } catch (err) {
    // continue to fallback
  }

  // Fallback: try per-user calls
  const results = [];
  for (const uid of filteredIds) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey },
        body: JSON.stringify({ userId: String(uid) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok)
        results.push({
          userId: uid,
          ok: false,
          error: data || `HTTP ${res.status}`,
        });
      else results.push({ userId: uid, ok: true, data });
    } catch (err) {
      results.push({ userId: uid, ok: false, error: err.message });
    }
  }

  return { ok: true, batch: false, results };
}

function parseBooleanFlag(value) {
  return value === "on" || value === "true" || value === true;
}

function parseBatchItems(body) {
  let items = body.items || body.tasks || body.urls;

  if (!items) return [];

  if (typeof items === "string") {
    const trimmed = items.trim();
    if (!trimmed) return [];

    try {
      items = JSON.parse(trimmed);
    } catch {
      items = trimmed
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((url) => ({ url }));
    }
  }

  if (!Array.isArray(items)) return [];
  return items;
}

function findFileForItem(item, files) {
  if (!files || !files.length) return null;

  if (typeof item.fileIndex === "number" && files[item.fileIndex]) {
    return files[item.fileIndex];
  }

  if (item.fileName) {
    const fileName = String(item.fileName || "");
    const exact = files.find(
      (f) =>
        f.originalname === fileName ||
        f.filename === fileName ||
        path.basename(f.originalname) === fileName,
    );
    if (exact) return exact;
  }

  return files.shift();
}

function normalizeBatchTitle(name, url) {
  // Preserve original metadata title when possible; sanitize but do not compress into a short slug.
  const baseTitle = String(name || "").trim();
  let candidate =
    sanitizeName(baseTitle) || (isYoutubeUrl(url) ? "YouTube audio" : "audio");
  if (!candidate) candidate = "audio";
  if (
    SAFE_TITLE_FALLBACKS.includes(candidate.toLowerCase()) ||
    isBadTitle(candidate)
  ) {
    return "audio";
  }
  return candidate;
}

function buildConvertTask(raw, files, defaultOptions = {}) {
  const task = {
    url: String(raw.url || "").trim(),
    file: null,
    title: typeof raw.title === "string" ? raw.title.trim() : "",
    speed: Number(raw.speed || defaultOptions.speed || 1),
    gainDb: Number(raw.gainDb || defaultOptions.gainDb || 0),
    pitchMode: raw.pitchMode === "tempo" ? "tempo" : "chipmunk",
    normalize: raw.normalize === "off" ? "off" : "on",
    quality: raw.quality === "max" ? "max" : "standard",
    cleanMaster: raw.cleanMaster === "on" ? "on" : "off",
    uploadRoblox: parseBooleanFlag(
      raw.uploadRoblox ?? defaultOptions.uploadRoblox,
    ),
    description:
      raw.description ||
      defaultOptions.description ||
      "Uploaded from automatic audio converter",
    shareWith: raw.shareWith || defaultOptions.shareWith,
    shareWithIds: raw.shareWithIds || defaultOptions.shareWithIds,
    robloxSettings: raw.robloxSettings || defaultOptions.robloxSettings || {},
    originalIndex: raw.originalIndex || null,
  };

  if (!raw.url && Array.isArray(files) && files.length) {
    task.file = findFileForItem(raw, files);
  }

  return task;
}

async function convertSingleTask(task) {
  const jobId = nanoid(7).toUpperCase();
  let inputPath = null;
  let tempInput = null;
  let localFile = task.file;
  let title = task.title || "audio";

  try {
    if (localFile) {
      inputPath = localFile.path;
      title = title || path.parse(localFile.originalname).name;
    } else if (task.url) {
      const url = String(task.url || "");
      if (isYoutubeUrl(url)) {
        try {
          const { stdout } = await runYtDlp(url, [
            "--dump-json",
            "--no-playlist",
            url,
          ]);
          const meta = JSON.parse(stdout || "{}");
          let metaTitle = meta && meta.title ? String(meta.title).trim() : null;
          if (!metaTitle) {
            // try oEmbed as a fallback to get a readable title
            metaTitle = await fetchYoutubeOEmbedTitle(url);
          }
          if (!metaTitle) {
            throw new Error(
              "YouTube memblokir ekstraksi metadata dari server ini.",
            );
          }
        } catch (err) {
          return {
            ok: false,
            error: getFriendlyYoutubeError(err && err.message),
            jobId,
            url,
          };
        }
      }

      if (isSpotifyUrl(url)) {
        const meta = await getSpotifyTrackInfo(url);

        if (!meta.previewUrl) {
          return {
            ok: false,
            error:
              "Spotify tidak menyediakan preview audio untuk konversi. Upload file atau gunakan URL lain.",
            jobId,
            url,
          };
        }

        inputPath = path.join(TMP_DIR, `${jobId}_spotify_preview.mp3`);
        await downloadToFile(meta.previewUrl, inputPath);
        title = title || meta.title || "spotify-preview";
      } else {
        tempInput = path.join(TMP_DIR, `${jobId}.%(ext)s`);
        const cleanUrl = isTiktokUrl(url) ? String(url).split("?")[0] : url;
        const tempBase = path.join(TMP_DIR, jobId);
        const wavPath = `${tempBase}.wav`;

        if (isYoutubeUrl(url) && !task.title) {
          try {
            const { stdout: metaOut } = await runYtDlp(url, [
              "--dump-json",
              "--no-playlist",
              url,
            ]);
            const meta = JSON.parse(metaOut || "{}");
            let metaTitle =
              meta && meta.title ? String(meta.title).trim() : null;
            if (!metaTitle) metaTitle = await fetchYoutubeOEmbedTitle(url);
            title = normalizeBatchTitle(metaTitle || "YouTube audio", url);
          } catch (err) {
            console.log("[convert] metadata fetch failed", err && err.message);
          }
        }

        const ytdlpArgsBase = ["--no-playlist", "-f", "bestaudio/best"];
        if (isTiktokUrl(url)) {
          ytdlpArgsBase.push(
            "--add-header",
            "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
          );
          ytdlpArgsBase.push(
            "--add-header",
            "Referer: https://www.tiktok.com/",
          );
        }

        try {
          const argsExtract = [
            ...ytdlpArgsBase,
            "--extract-audio",
            "--audio-format",
            "wav",
            "-o",
            `${tempBase}.%(ext)s`,
          ];
          await runYtDlp(url, [...argsExtract, cleanUrl]);

          if (fs.existsSync(wavPath)) {
            inputPath = wavPath;
          } else {
            const files = fs
              .readdirSync(TMP_DIR)
              .filter((f) => f.startsWith(jobId + "."));
            if (files.length) {
              inputPath = path.join(TMP_DIR, files[0]);
            } else {
              throw new Error("yt-dlp tidak menghasilkan file audio.");
            }
          }
        } catch (err) {
          const msg = String((err && err.message) || "");
          if (
            msg.includes("Postprocessing") ||
            msg.includes("unable to obtain file audio codec") ||
            msg.includes("Sign in to confirm you’re not a bot") ||
            msg.includes("Sign in to confirm you're not a bot") ||
            msg.includes("cookies") ||
            msg.includes("bot") ||
            msg.includes("javascript runtime")
          ) {
            const argsVideo = [
              "--no-playlist",
              "-f",
              "bestvideo+bestaudio/best",
              "-o",
              `${tempBase}.%(ext)s`,
            ];
            if (isTiktokUrl(url)) {
              argsVideo.push(
                "--add-header",
                "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
              );
              argsVideo.push(
                "--add-header",
                "Referer: https://www.tiktok.com/",
              );
            }

            await runYtDlp(url, [...argsVideo, cleanUrl]);
            const files = fs
              .readdirSync(TMP_DIR)
              .filter((f) => f.startsWith(jobId + "."));
            let produced = null;
            if (files.length) {
              produced = path.join(TMP_DIR, files[0]);
            }

            if (!produced || !fs.existsSync(produced)) {
              throw new Error(getFriendlyYoutubeError(err && err.message));
            }

            inputPath = produced;
            const audioProbe = await run(bin("ffprobe"), [
              "-v",
              "error",
              "-select_streams",
              "a",
              "-show_entries",
              "stream=index",
              "-of",
              "csv=p=0",
              inputPath,
            ]).catch(() => ({ stdout: "" }));
            if (!String(audioProbe.stdout || "").trim()) {
              const argsAudioOnly = [
                "--no-playlist",
                "-f",
                "bestaudio/best",
                "-o",
                `${tempBase}.%(ext)s`,
              ];
              if (isTiktokUrl(url)) {
                argsAudioOnly.push(
                  "--add-header",
                  "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
                );
                argsAudioOnly.push(
                  "--add-header",
                  "Referer: https://www.tiktok.com/",
                );
              }

              await runYtDlp(url, [...argsAudioOnly, cleanUrl]);
              const files2 = fs
                .readdirSync(TMP_DIR)
                .filter((f) => f.startsWith(jobId + "."));
              const audioFile =
                files2.find((f) =>
                  /\.(m4a|mp3|webm|wav|opus|ogg|aac)$/i.test(f),
                ) || files2[0];
              if (audioFile) {
                inputPath = path.join(TMP_DIR, audioFile);
              }
            }
          } else {
            throw err;
          }
        }

        title =
          title ||
          (isYoutubeUrl(url)
            ? "youtube-audio"
            : isSoundCloudUrl(url)
              ? makeShortSoundCloudTitle(url)
              : "url-audio");
      }
    } else {
      return {
        ok: false,
        error: "Masukkan URL atau upload file audio/video untuk setiap item.",
        jobId,
      };
    }

    // ensure we have a meaningful title before creating filenames/parts
    try {
      if (task.url && isYoutubeUrl(task.url)) {
        const { stdout: metaOut } = await runYtDlp(task.url, [
          "--dump-json",
          "--no-playlist",
          task.url,
        ]);
        const meta = JSON.parse(metaOut || "{}");
        let metaTitle = meta && meta.title ? String(meta.title).trim() : null;
        if (!metaTitle) metaTitle = await fetchYoutubeOEmbedTitle(task.url);
        if (metaTitle && !looksLikeVideoId(metaTitle)) {
          if (!title || title === "audio" || /^audio$/i.test(title))
            title = metaTitle;
        }
      } else if (task.url && isSoundCloudUrl(task.url)) {
        // for SoundCloud prefer short generated title when missing
        if (!title || title === "audio" || /^audio$/i.test(title))
          title = makeShortSoundCloudTitle(task.url);
      }
    } catch (e) {
      // ignore metadata fetch errors; fallback to existing title
    }

    const safeTitle = title ? normalizeBatchTitle(title, task.url) : "audio";
    const safeBaseNoCode = makeShortBase(safeTitle);
    const outputName = makeUniqueFileName(safeBaseNoCode, ".ogg");
    const filenameBase = path.parse(outputName).name;
    const displayTitle = makeDisplayTitle(safeTitle);
    const outputPath = path.join(OUT_DIR, outputName);

    const cleanUrlGlobal = isTiktokUrl(task.url)
      ? String(task.url).split("?")[0]
      : task.url;
    const hasAudio = await hasAudioStream(inputPath);
    if (!hasAudio) {
      if (task.url) {
        const tempBaseGlobal = path.join(TMP_DIR, jobId);
        const argsAudioOnly = [
          "--no-playlist",
          "-f",
          "bestaudio/best",
          "-o",
          `${tempBaseGlobal}.%(ext)s`,
        ];
        if (isTiktokUrl(task.url)) {
          argsAudioOnly.push(
            "--add-header",
            "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
          );
          argsAudioOnly.push(
            "--add-header",
            "Referer: https://www.tiktok.com/",
          );
        }

        await runYtDlp(task.url, [...argsAudioOnly, cleanUrlGlobal]);
        const produced = fs
          .readdirSync(TMP_DIR)
          .filter((f) => f.startsWith(jobId + "."));
        const audioFile = produced.find((f) =>
          /\.(m4a|mp3|webm|wav|opus|ogg|aac)$/i.test(f),
        );
        if (audioFile) {
          inputPath = path.join(TMP_DIR, audioFile);
        }
      }

      const hasAudioAfter = await hasAudioStream(inputPath);
      if (!hasAudioAfter) {
        return {
          ok: false,
          error: "Media tidak mengandung track audio yang dapat dikonversi.",
          jobId,
          title: safeTitle,
        };
      }
    }

    const args = [
      "-y",
      "-hide_banner",
      "-i",
      inputPath,
      "-vn",
      "-map",
      "0:a:0",
      "-af",
      makeCleanAudioFilter({
        speed: task.speed,
        pitchMode: task.pitchMode,
        gainDb: task.gainDb,
        normalize: task.normalize,
        cleanMaster: task.cleanMaster,
      }),
      "-ar",
      "48000",
      "-ac",
      "2",
      "-c:a",
      "libvorbis",
      "-q:a",
      task.quality === "max" ? "8" : "6",
      outputPath,
    ];

    await run(bin("ffmpeg"), args);
    const stats = await fsp.stat(outputPath);
    const PART_SECONDS = 6 * 60 + 59;
    const ffprobe = await run(bin("ffprobe"), [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      outputPath,
    ]).catch(() => ({ stdout: "0" }));
    const durationSec = Math.floor(Number(ffprobe.stdout || "0")) || 0;
    const parts = [];

    if (durationSec > PART_SECONDS) {
      const numParts = Math.ceil(durationSec / PART_SECONDS);
      for (let i = 0; i < numParts; i++) {
        const start = i * PART_SECONDS;
        const segDuration = Math.min(PART_SECONDS, durationSec - start);
        const partName = `${filenameBase}_part${i + 1}.ogg`;
        const partPath = path.join(OUT_DIR, partName);

        const segArgs = [
          "-y",
          "-hide_banner",
          "-ss",
          String(start),
          "-t",
          String(segDuration),
          "-i",
          outputPath,
          "-vn",
          "-ac",
          "2",
          "-ar",
          "48000",
          "-c:a",
          "libvorbis",
          "-q:a",
          task.quality === "max" ? "8" : "6",
          partPath,
        ];
        await run(bin("ffmpeg"), segArgs);
        const pstat = await fsp.stat(partPath);
        parts.push({
          fileName: partName,
          url: `${PUBLIC_BASE_URL}/downloads/${encodeURIComponent(partName)}`,
          size: pstat.size,
        });
      }
      await cleanup(outputPath);
    } else {
      parts.push({
        fileName: outputName,
        url: `${PUBLIC_BASE_URL}/downloads/${encodeURIComponent(outputName)}`,
        size: stats.size,
      });
    }

    await cleanup(localFile?.path);
    if (!localFile && isSpotifyUrl(task.url)) {
      await cleanup(inputPath);
    }
    if (tempInput) {
      await cleanup(path.join(TMP_DIR, `${jobId}.wav`));
    }

    let roblox = null;
    if (task.uploadRoblox) {
      try {
        if (parts.length > 1) {
          const uploads = [];
          for (const p of parts) {
            try {
              const r = await uploadAudioToRoblox(
                path.join(OUT_DIR, p.fileName),
                safeTitle,
                task.description,
                task.robloxSettings,
              );
              if ((task.shareWith || task.shareWithIds) && r?.assetId) {
                const shareIds = Array.isArray(task.shareWithIds)
                  ? task.shareWithIds
                  : task.shareWith
                    ? [task.shareWith]
                    : [];
                if (shareIds.length) {
                  const permRes = await setRobloxPermissions(
                    r.assetId,
                    shareIds,
                    task.robloxSettings,
                  );
                  uploads.push({
                    ok: true,
                    fileName: p.fileName,
                    roblox: r,
                    permissions: permRes,
                  });
                } else {
                  uploads.push({ ok: true, fileName: p.fileName, roblox: r });
                }
              } else {
                uploads.push({ ok: true, fileName: p.fileName, roblox: r });
              }
            } catch (err) {
              uploads.push({
                ok: false,
                fileName: p.fileName,
                error: err.message,
              });
            }
          }
          roblox = { batch: uploads };
        } else {
          roblox = await uploadAudioToRoblox(
            path.join(OUT_DIR, parts[0].fileName),
            safeTitle,
            task.description,
            task.robloxSettings,
          );
          if ((task.shareWith || task.shareWithIds) && roblox?.assetId) {
            const shareIds = Array.isArray(task.shareWithIds)
              ? task.shareWithIds
              : task.shareWith
                ? [task.shareWith]
                : [];
            if (shareIds.length) {
              const permRes = await setRobloxPermissions(
                roblox.assetId,
                shareIds,
                task.robloxSettings,
              );
              roblox.permissions = permRes;
            }
          }
        }
      } catch (err) {
        roblox = { ok: false, error: err.message };
      }
    }

    return {
      ok: true,
      jobId,
      title: displayTitle,
      fileName: parts[0].fileName,
      durationSec,
      fileList: parts,
      format: "OGG",
      size: parts.reduce((s, p) => s + (p.size || 0), 0),
      speed: task.speed,
      gainDb: task.gainDb,
      pitchMode: task.pitchMode,
      normalize: task.normalize,
      quality: task.quality,
      cleanMaster: task.cleanMaster,
      robloxPlaybackSpeed: Number((1 / task.speed).toFixed(4)),
      roblox,
    };
  } catch (err) {
    await cleanup(localFile?.path);
    if (!localFile && isSpotifyUrl(task.url)) {
      await cleanup(inputPath);
    }
    if (tempInput) {
      await cleanup(path.join(TMP_DIR, `${jobId}.wav`));
    }

    return {
      ok: false,
      jobId,
      error: err.message,
      title: title || "audio",
      url: task.url,
    };
  }
}

/**
 * =========================
 * API ROUTES
 * =========================
 */

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    server: "running",
  });
});

app.post("/api/metadata", async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({
        error: "URL wajib diisi.",
      });
    }

    if (isSpotifyUrl(url)) {
      return res.json(await getSpotifyTrackInfo(url));
    }

    if (isYoutubeUrl(url)) {
      const { stdout } = await runYtDlp(url, [
        "--dump-json",
        "--no-playlist",
        url,
      ]);
      const data = JSON.parse(stdout || "{}");
      let metaTitle = data && data.title ? String(data.title).trim() : null;
      if (!metaTitle) metaTitle = await fetchYoutubeOEmbedTitle(url);

      return res.json({
        provider: "YouTube",
        title: normalizeTitle(metaTitle || "YouTube audio", 5),
        thumbnail: data.thumbnail || "",
        duration: data.duration || null,
      });
    }

    if (isTiktokUrl(url)) {
      const { stdout } = await runYtDlp(url, [
        "--dump-json",
        "--no-playlist",
        url,
      ]);

      const data = JSON.parse(stdout);

      return res.json({
        provider: "TikTok",
        title: normalizeTitle(data.title || "TikTok video", 5),
        thumbnail: data.thumbnail || "",
        duration: data.duration || null,
      });
    }

    if (isSoundCloudUrl(url)) {
      return res.json({
        provider: "SoundCloud",
        title: makeShortSoundCloudTitle(url),
        thumbnail: "",
        duration: null,
        note: "SoundCloud link terdeteksi. Judul dipendekkan dan diberi akhiran acak.",
      });
    }

    return res.json({
      provider: "URL",
      title: normalizeTitle("Direct audio URL", 5),
      thumbnail: "",
      duration: null,
    });
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

app.get("/api/roblox-settings", (req, res) => {
  try {
    const settings = loadRobloxSettings({ rootDir: ROOT });
    res.json({
      ok: true,
      settings: {
        apiKey: settings.apiKey || "",
        creatorId: settings.creatorId || "",
        creatorType: settings.creatorType || "user",
        uploadUrl: settings.uploadUrl || "",
        setPermissionUrl: settings.setPermissionUrl || "",
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/api/roblox-settings", express.json(), (req, res) => {
  try {
    const settings = saveRobloxSettings(
      {
        apiKey: req.body?.apiKey,
        creatorId: req.body?.creatorId,
        creatorType: req.body?.creatorType,
        uploadUrl: req.body?.uploadUrl,
        setPermissionUrl: req.body?.setPermissionUrl,
      },
      { rootDir: ROOT },
    );
    res.json({ ok: true, settings });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/api/convert", upload.array("files", 20), async (req, res) => {
  const batchItems = parseBatchItems(req.body);
  const files = Array.isArray(req.files) ? [...req.files] : [];
  const shouldBatch = batchItems.length > 0 || files.length > 1;

  if (!shouldBatch) {
    const jobId = nanoid(7).toUpperCase();
    let inputPath = null;
    let tempInput = null;
    const uploadedFile = files[0] || null;
    const url = req.body.url || "";

    try {
      const speed = Math.max(0.25, Math.min(4, Number(req.body.speed || 1)));
      const gainDb = Math.max(-20, Math.min(20, Number(req.body.gainDb || 0)));
      const pitchMode = req.body.pitchMode === "tempo" ? "tempo" : "chipmunk";
      const normalize = req.body.normalize === "off" ? "off" : "on";
      const quality = req.body.quality === "max" ? "max" : "standard";
      const cleanMaster = req.body.cleanMaster === "on" ? "on" : "off";

      const uploadRoblox =
        req.body.uploadRoblox === "on" ||
        req.body.uploadRoblox === "true" ||
        req.body.uploadRoblox === true;

      let title = req.body.title || "audio";

      if (uploadedFile) {
        inputPath = uploadedFile.path;
        title = path.parse(uploadedFile.originalname).name || title;
      } else if (url) {
        if (isSpotifyUrl(url)) {
          const meta = await getSpotifyTrackInfo(url);

          if (!meta.previewUrl) {
            return res.status(400).json({
              error:
                "Spotify tidak menyediakan file audio penuh untuk converter. Track ini juga tidak punya preview_url resmi. Solusi legal: upload file audio milikmu, atau gunakan link direct audio/YouTube yang memang boleh kamu konversi.",
            });
          }

          inputPath = path.join(TMP_DIR, `${jobId}_spotify_preview.mp3`);
          await downloadToFile(meta.previewUrl, inputPath);
          title = req.body.title || meta.title || "spotify-preview";
        } else {
          tempInput = path.join(TMP_DIR, `${jobId}.%(ext)s`);

          if (isYoutubeUrl(url) && !req.body.title) {
            try {
              const { stdout: metaOut } = await runYtDlp(url, [
                "--dump-json",
                "--no-playlist",
                url,
              ]);
              const meta = JSON.parse(metaOut || "{}");
              let metaTitle =
                meta && meta.title ? String(meta.title).trim() : null;
              if (!metaTitle) metaTitle = await fetchYoutubeOEmbedTitle(url);
              if (metaTitle && !looksLikeVideoId(metaTitle)) {
                title = normalizeTitle(metaTitle, 5);
              }
            } catch (e) {
              console.log(
                "[convert] yt-dlp metadata fetch failed:",
                e && e.message,
              );
            }
          }

          const cleanUrl = isTiktokUrl(url) ? String(url).split("?")[0] : url;
          const tempBase = path.join(TMP_DIR, jobId);
          const wavPath = `${tempBase}.wav`;

          const ytdlpArgsBase = ["--no-playlist", "-f", "bestaudio/best"];

          if (isTiktokUrl(url)) {
            ytdlpArgsBase.push(
              "--add-header",
              "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
            );
            ytdlpArgsBase.push(
              "--add-header",
              "Referer: https://www.tiktok.com/",
            );
          }

          try {
            const argsExtract = [
              ...ytdlpArgsBase,
              "--extract-audio",
              "--audio-format",
              "wav",
              "-o",
              `${tempBase}.%(ext)s`,
            ];
            await runYtDlp(url, [...argsExtract, cleanUrl]);

            if (fs.existsSync(wavPath)) {
              inputPath = wavPath;
            } else {
              const filesFound = fs
                .readdirSync(TMP_DIR)
                .filter((f) => f.startsWith(jobId + "."));
              if (filesFound.length) {
                inputPath = path.join(TMP_DIR, filesFound[0]);
              } else {
                throw new Error("yt-dlp tidak menghasilkan file audio.");
              }
            }
          } catch (err) {
            const msg = String((err && err.message) || "");
            if (
              msg.includes("Postprocessing") ||
              msg.includes("unable to obtain file audio codec") ||
              msg.includes("unable to obtain file audio codec with ffprobe") ||
              msg.includes("Sign in to confirm you’re not a bot") ||
              msg.includes("Sign in to confirm you're not a bot") ||
              msg.includes("cookies") ||
              msg.includes("bot") ||
              msg.includes("javascript runtime")
            ) {
              const argsVideo = [
                "--no-playlist",
                "-f",
                "bestvideo+bestaudio/best",
                "-o",
                `${tempBase}.%(ext)s`,
              ];
              if (isTiktokUrl(url)) {
                argsVideo.push(
                  "--add-header",
                  "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
                );
                argsVideo.push(
                  "--add-header",
                  "Referer: https://www.tiktok.com/",
                );
              }

              await runYtDlp(url, [...argsVideo, cleanUrl]);
              const files2 = fs
                .readdirSync(TMP_DIR)
                .filter((f) => f.startsWith(jobId + "."));
              let produced = null;
              if (files2.length) {
                produced = path.join(TMP_DIR, files2[0]);
              }

              if (!produced || !fs.existsSync(produced)) {
                throw new Error("Gagal download video sebagai fallback.");
              }

              inputPath = produced;
              const audioProbe = await run(bin("ffprobe"), [
                "-v",
                "error",
                "-select_streams",
                "a",
                "-show_entries",
                "stream=index",
                "-of",
                "csv=p=0",
                inputPath,
              ]).catch(() => ({ stdout: "" }));
              if (!String(audioProbe.stdout || "").trim()) {
                const argsAudioOnly = [
                  "--no-playlist",
                  "-f",
                  "bestaudio/best",
                  "-o",
                  `${tempBase}.%(ext)s`,
                ];
                if (isTiktokUrl(url)) {
                  argsAudioOnly.push(
                    "--add-header",
                    "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
                  );
                  argsAudioOnly.push(
                    "--add-header",
                    "Referer: https://www.tiktok.com/",
                  );
                }

                await runYtDlp(url, [...argsAudioOnly, cleanUrl]);
                const files3 = fs
                  .readdirSync(TMP_DIR)
                  .filter((f) => f.startsWith(jobId + "."));
                const audioFile =
                  files3.find((f) =>
                    /\.(m4a|mp3|webm|wav|opus|ogg|aac)$/i.test(f),
                  ) || files3[0];
                if (audioFile) {
                  inputPath = path.join(TMP_DIR, audioFile);
                }
              }
            } else {
              throw err;
            }
          }

          title =
            req.body.title ||
            (isYoutubeUrl(url)
              ? "youtube-audio"
              : isSoundCloudUrl(url)
                ? makeShortSoundCloudTitle(url)
                : "url-audio");
        }
      } else {
        return res.status(400).json({
          error: "Masukkan URL atau upload file audio/video.",
        });
      }

      const safeTitle = isYoutubeUrl(url)
        ? normalizeTitle(title, 5)
        : normalizeTitle(title, 3);
      const safeBaseNoCode = makeShortBase(safeTitle);
      const outputName = makeUniqueFileName(safeBaseNoCode, ".ogg");
      const filenameBase = path.parse(outputName).name;
      const displayTitle = makeDisplayTitle(safeTitle);
      const outputPath = path.join(OUT_DIR, outputName);

      const cleanUrlGlobal = isTiktokUrl(url) ? String(url).split("?")[0] : url;
      const hasAudio = await hasAudioStream(inputPath);
      if (!hasAudio) {
        if (url) {
          const tempBaseGlobal = path.join(TMP_DIR, jobId);
          const argsAudioOnly = [
            "--no-playlist",
            "-f",
            "bestaudio/best",
            "-o",
            `${tempBaseGlobal}.%(ext)s`,
          ];
          if (isTiktokUrl(url)) {
            argsAudioOnly.push(
              "--add-header",
              "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
            );
            argsAudioOnly.push(
              "--add-header",
              "Referer: https://www.tiktok.com/",
            );
          }

          await runYtDlp(url, [...argsAudioOnly, cleanUrlGlobal]);

          const produced = fs
            .readdirSync(TMP_DIR)
            .filter((f) => f.startsWith(jobId + "."));
          const audioFile = produced.find((f) =>
            /\.(m4a|mp3|webm|wav|opus|ogg|aac)$/i.test(f),
          );
          if (audioFile) {
            inputPath = path.join(TMP_DIR, audioFile);
          }
        }

        const hasAudioAfter = await hasAudioStream(inputPath);
        if (!hasAudioAfter) {
          return res.status(400).json({
            error: "Media tidak mengandung track audio yang dapat dikonversi.",
          });
        }
      }

      const args = [
        "-y",
        "-hide_banner",
        "-i",
        inputPath,
        "-vn",
        "-map",
        "0:a:0",
        "-af",
        makeCleanAudioFilter({
          speed,
          pitchMode,
          gainDb,
          normalize,
          cleanMaster,
        }),
        "-ar",
        "48000",
        "-ac",
        "2",
        "-c:a",
        "libvorbis",
        "-q:a",
        quality === "max" ? "8" : "6",
        outputPath,
      ];

      await run(bin("ffmpeg"), args);
      const stats = await fsp.stat(outputPath);

      const PART_SECONDS = 6 * 60 + 59;
      const ffprobe = await run(bin("ffprobe"), [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        outputPath,
      ]).catch(() => ({ stdout: "0" }));

      const durationSec = Math.floor(Number(ffprobe.stdout || "0")) || 0;
      const parts = [];

      if (durationSec > PART_SECONDS) {
        const numParts = Math.ceil(durationSec / PART_SECONDS);
        for (let i = 0; i < numParts; i++) {
          const start = i * PART_SECONDS;
          const segDuration = Math.min(PART_SECONDS, durationSec - start);
          const partName = `${filenameBase}_part${i + 1}.ogg`;
          const partPath = path.join(OUT_DIR, partName);

          const segArgs = [
            "-y",
            "-hide_banner",
            "-ss",
            String(start),
            "-t",
            String(segDuration),
            "-i",
            outputPath,
            "-vn",
            "-ac",
            "2",
            "-ar",
            "48000",
            "-c:a",
            "libvorbis",
            "-q:a",
            quality === "max" ? "8" : "6",
            partPath,
          ];
          await run(bin("ffmpeg"), segArgs);
          const pstat = await fsp.stat(partPath);
          parts.push({
            fileName: partName,
            url: `${PUBLIC_BASE_URL}/downloads/${encodeURIComponent(partName)}`,
            size: pstat.size,
          });
        }
        await cleanup(outputPath);
      } else {
        parts.push({
          fileName: outputName,
          url: `${PUBLIC_BASE_URL}/downloads/${encodeURIComponent(outputName)}`,
          size: stats.size,
        });
      }

      await cleanup(uploadedFile?.path);
      if (!uploadedFile && isSpotifyUrl(url)) {
        await cleanup(inputPath);
      }
      if (tempInput) {
        await cleanup(path.join(TMP_DIR, `${jobId}.wav`));
      }

      const robloxSettings = extractRobloxSettingsFromRequest(req);
      let roblox = null;
      if (uploadRoblox) {
        try {
          if (parts.length > 1) {
            const uploads = [];
            for (const p of parts) {
              try {
                const r = await uploadAudioToRoblox(
                  path.join(OUT_DIR, p.fileName),
                  safeTitle,
                  req.body.description ||
                    "Uploaded from automatic audio converter",
                  robloxSettings,
                );
                if (
                  (req.body.shareWith || req.body.shareWithIds) &&
                  r?.assetId
                ) {
                  const shareIds = Array.isArray(req.body.shareWithIds)
                    ? req.body.shareWithIds
                    : req.body.shareWith
                      ? [req.body.shareWith]
                      : [];
                  if (shareIds.length) {
                    const permRes = await setRobloxPermissions(
                      r.assetId,
                      shareIds,
                      robloxSettings,
                    );
                    uploads.push({
                      ok: true,
                      fileName: p.fileName,
                      roblox: r,
                      permissions: permRes,
                    });
                  } else {
                    uploads.push({ ok: true, fileName: p.fileName, roblox: r });
                  }
                } else {
                  uploads.push({ ok: true, fileName: p.fileName, roblox: r });
                }
              } catch (err) {
                uploads.push({
                  ok: false,
                  fileName: p.fileName,
                  error: err.message,
                });
              }
            }
            roblox = { batch: uploads };
          } else {
            roblox = await uploadAudioToRoblox(
              path.join(OUT_DIR, parts[0].fileName),
              safeTitle,
              req.body.description || "Uploaded from automatic audio converter",
              robloxSettings,
            );
            if (
              (req.body.shareWith || req.body.shareWithIds) &&
              roblox?.assetId
            ) {
              const shareIds = Array.isArray(req.body.shareWithIds)
                ? req.body.shareWithIds
                : req.body.shareWith
                  ? [req.body.shareWith]
                  : [];
              if (shareIds.length) {
                const permRes = await setRobloxPermissions(
                  roblox.assetId,
                  shareIds,
                  robloxSettings,
                );
                roblox.permissions = permRes;
              }
            }
          }
        } catch (err) {
          roblox = { ok: false, error: err.message };
        }
      }

      return res.json({
        ok: true,
        jobId,
        title: displayTitle,
        fileName: parts[0].fileName,
        durationSec,
        fileList: parts,
        format: "OGG",
        size: parts.reduce((s, p) => s + (p.size || 0), 0),
        speed,
        gainDb,
        pitchMode,
        normalize,
        quality,
        cleanMaster,
        robloxPlaybackSpeed: Number((1 / speed).toFixed(4)),
        roblox,
      });
    } catch (err) {
      await cleanup(uploadedFile?.path);
      if (!uploadedFile && isSpotifyUrl(url)) {
        await cleanup(inputPath);
      }
      if (tempInput) {
        await cleanup(path.join(TMP_DIR, `${jobId}.wav`));
      }

      return res.status(500).json({ error: err.message });
    }
  }

  try {
    const defaultOptions = {
      speed: Number(req.body.speed || 1),
      gainDb: Number(req.body.gainDb || 0),
      pitchMode: req.body.pitchMode === "tempo" ? "tempo" : "chipmunk",
      normalize: req.body.normalize === "off" ? "off" : "on",
      quality: req.body.quality === "max" ? "max" : "standard",
      cleanMaster: req.body.cleanMaster === "on" ? "on" : "off",
      uploadRoblox: parseBooleanFlag(req.body.uploadRoblox),
      description:
        req.body.description || "Uploaded from automatic audio converter",
      shareWith: req.body.shareWith,
      shareWithIds: req.body.shareWithIds,
      robloxSettings: extractRobloxSettingsFromRequest(req),
    };

    const tasks = [];
    if (batchItems.length) {
      batchItems.forEach((item, index) => {
        const raw = { ...item, originalIndex: index };
        tasks.push(buildConvertTask(raw, files, defaultOptions));
      });
    } else {
      files.forEach((file) => {
        const raw = {
          title: req.body.title || path.parse(file.originalname).name,
          speed: req.body.speed,
          gainDb: req.body.gainDb,
          pitchMode: req.body.pitchMode,
          normalize: req.body.normalize,
          quality: req.body.quality,
          cleanMaster: req.body.cleanMaster,
          uploadRoblox: req.body.uploadRoblox,
          description: req.body.description,
          shareWith: req.body.shareWith,
          shareWithIds: req.body.shareWithIds,
          robloxSettings: extractRobloxSettingsFromRequest(req),
        };
        tasks.push(buildConvertTask(raw, [file], defaultOptions));
      });
    }

    const results = [];
    for (const task of tasks) {
      results.push(await convertSingleTask(task));
    }

    return res.json({ ok: true, count: results.length, results });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post("/api/convert-batch", upload.array("files", 20), async (req, res) => {
  try {
    const defaultOptions = {
      speed: Number(req.body.speed || 1),
      gainDb: Number(req.body.gainDb || 0),
      pitchMode: req.body.pitchMode === "tempo" ? "tempo" : "chipmunk",
      normalize: req.body.normalize === "off" ? "off" : "on",
      quality: req.body.quality === "max" ? "max" : "standard",
      cleanMaster: req.body.cleanMaster === "on" ? "on" : "off",
      uploadRoblox: parseBooleanFlag(req.body.uploadRoblox),
      description:
        req.body.description || "Uploaded from automatic audio converter",
      shareWith: req.body.shareWith,
      shareWithIds: req.body.shareWithIds,
    };

    const items = parseBatchItems(req.body);
    const files = Array.isArray(req.files) ? [...req.files] : [];
    const tasks = [];

    if (items.length) {
      items.forEach((item, index) => {
        const raw = { ...item, originalIndex: index };
        tasks.push(buildConvertTask(raw, files, defaultOptions));
      });
    } else if (files.length) {
      files.forEach((file) => {
        const raw = {
          title: req.body.title || path.parse(file.originalname).name,
          speed: req.body.speed,
          gainDb: req.body.gainDb,
          pitchMode: req.body.pitchMode,
          normalize: req.body.normalize,
          quality: req.body.quality,
          cleanMaster: req.body.cleanMaster,
          uploadRoblox: req.body.uploadRoblox,
          description: req.body.description,
          shareWith: req.body.shareWith,
          shareWithIds: req.body.shareWithIds,
          robloxSettings: extractRobloxSettingsFromRequest(req),
        };
        const task = buildConvertTask(raw, [file], defaultOptions);
        tasks.push(task);
      });
    }

    if (!tasks.length) {
      return res.status(400).json({
        error: "Tidak ada item konversi. Kirim URL, file, atau daftar items.",
      });
    }

    const results = [];
    for (const task of tasks) {
      results.push(await convertSingleTask(task));
    }

    res.json({ ok: true, count: results.length, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Bisa 2 cara:
 * 1. Kirim JSON:
 *    {
 *      "fileName": "audio_ABC1234.ogg"
 *    }
 *
 * 2. Kirim form-data:
 *    file = audio.ogg
 */
app.post("/api/upload-roblox", upload.single("file"), async (req, res) => {
  let directUploadPath = null;

  try {
    let filePath = null;
    let safeFileName = null;
    let displayName = req.body.title || "audio";

    if (req.file) {
      directUploadPath = req.file.path;
      filePath = req.file.path;
      safeFileName = req.file.originalname || `${nanoid(7)}.ogg`;
      displayName =
        req.body.title || path.parse(req.file.originalname || "audio").name;
    } else if (req.body.fileNames && Array.isArray(req.body.fileNames)) {
      // Batch upload by fileNames array
      const robloxSettings = extractRobloxSettingsFromRequest(req);
      const results = [];
      for (const fnameRaw of req.body.fileNames) {
        const fname = path.basename(String(fnameRaw || ""));
        if (!fname.toLowerCase().endsWith(".ogg")) {
          results.push({
            fileName: fname,
            ok: false,
            error: "Not an .ogg file",
          });
          continue;
        }

        const fpath = path.join(OUT_DIR, fname);
        if (!fs.existsSync(fpath)) {
          results.push({
            fileName: fname,
            ok: false,
            error: "File not found in downloads",
          });
          continue;
        }

        try {
          const r = await uploadAudioToRoblox(
            fpath,
            req.body.title || path.parse(fname).name,
            req.body.description || "Uploaded from automatic audio converter",
            robloxSettings,
          );
          // apply permissions if requested
          if ((req.body.shareWith || req.body.shareWithIds) && r?.assetId) {
            const shareIds = Array.isArray(req.body.shareWithIds)
              ? req.body.shareWithIds
              : req.body.shareWith
                ? [req.body.shareWith]
                : [];
            const permRes = shareIds.length
              ? await setRobloxPermissions(r.assetId, shareIds, robloxSettings)
              : null;
            results.push({
              fileName: fname,
              ok: true,
              assetId: r.assetId,
              robloxAssetUrl: r.robloxAssetUrl,
              permissions: permRes,
            });
          } else {
            results.push({
              fileName: fname,
              ok: true,
              assetId: r.assetId,
              robloxAssetUrl: r.robloxAssetUrl,
            });
          }
        } catch (err) {
          results.push({ fileName: fname, ok: false, error: err.message });
        }
      }

      await cleanup(directUploadPath);
      return res.json({ ok: true, batch: results });
    } else if (req.body.fileName) {
      safeFileName = path.basename(req.body.fileName);

      if (!safeFileName.toLowerCase().endsWith(".ogg")) {
        return res.status(400).json({
          error: "Hanya file .ogg dari folder downloads yang bisa diupload.",
        });
      }

      filePath = path.join(OUT_DIR, safeFileName);

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({
          error:
            "File tidak ditemukan di folder downloads. Convert audio dulu.",
        });
      }

      displayName = req.body.title || path.parse(safeFileName).name;
    } else {
      return res.status(400).json({
        error:
          'Kirim file .ogg langsung dengan field "file", atau kirim fileName dari hasil /api/convert.',
      });
    }

    const robloxSettings = extractRobloxSettingsFromRequest(req);
    const result = await uploadAudioToRoblox(
      filePath,
      displayName,
      req.body.description || "Uploaded from Dodo",
      robloxSettings,
    );

    // apply permissions if provided
    if ((req.body.shareWith || req.body.shareWithIds) && result?.assetId) {
      const shareIds = Array.isArray(req.body.shareWithIds)
        ? req.body.shareWithIds
        : req.body.shareWith
          ? [req.body.shareWith]
          : [];
      if (shareIds.length) {
        const permRes = await setRobloxPermissions(
          result.assetId,
          shareIds,
          robloxSettings,
        );
        result.permissions = permRes;
      }
    }

    await cleanup(directUploadPath);

    res.json({
      ok: true,
      fileName: safeFileName,
      title: sanitizeName(displayName),
      assetId: result.assetId,
      robloxAssetUrl: result.robloxAssetUrl,
      operation: result.operation,
    });
  } catch (err) {
    await cleanup(directUploadPath);

    res.status(500).json({
      error: err.message,
    });
  }
});

app.get("/health", (req, res) => {
  res.json({ ok: true, status: "healthy", port: PORT });
});

app.use((err, req, res, next) => {
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({
      error: `File terlalu besar. Maksimal ${MAX_UPLOAD_MB}MB.`,
    });
  }

  res.status(500).json({
    error: err.message || "Server error.",
  });
});

function startServer(port, attempts = 10) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, "0.0.0.0", () => {
      console.log(`Audio converter running: http://0.0.0.0:${port}`);
      resolve(server);
    });

    server.on("error", (err) => {
      if (err.code === "EADDRINUSE" && attempts > 0) {
        console.warn(`Port ${port} is busy, trying ${port + 1}...`);
        server.close(() => resolve(startServer(port + 1, attempts - 1)));
        return;
      }

      reject(err);
    });
  });
}

startServer(PORT).catch((err) => {
  console.error("Failed to start server:", err.message);
  process.exit(1);
});
