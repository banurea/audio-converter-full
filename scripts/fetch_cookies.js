const fs = require("fs");
const path = require("path");
const https = require("https");

const ROOT = path.join(__dirname, "..");
const TMP_DIR = path.join(ROOT, "tmp");
const DEST = path.join(TMP_DIR, "cookies.txt");

function writeCookies(content) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  fs.writeFileSync(DEST, content, { mode: 0o600 });
  console.log("Wrote cookies to", DEST);
}

async function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode !== 200)
          return reject(new Error("HTTP " + res.statusCode));
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve(data));
      })
      .on("error", reject);
  });
}

async function main() {
  try {
    const base64 = process.env.YT_DLP_COOKIES_BASE64;
    const url = process.env.YT_DLP_COOKIES_URL;

    if (base64) {
      const content = Buffer.from(base64, "base64").toString("utf8");
      writeCookies(content);
      return;
    }

    if (url) {
      console.log("Fetching cookies from URL...");
      const content = await fetchUrl(url);
      writeCookies(content);
      return;
    }

    console.error(
      "No YT_DLP_COOKIES_BASE64 or YT_DLP_COOKIES_URL provided. Nothing to do.",
    );
    process.exit(2);
  } catch (err) {
    console.error("Failed to fetch/write cookies:", err && err.message);
    process.exit(1);
  }
}

main();
