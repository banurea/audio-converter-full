const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildYtDlpArgs } = require('../lib/yt-dlp-helpers');

test('buildYtDlpArgs adds a cookies file when provided', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yt-dlp-cookies-'));
  const cookiePath = path.join(tempDir, 'cookies.txt');
  fs.writeFileSync(cookiePath, '');

  const args = buildYtDlpArgs({
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    extraArgs: ['--dump-json'],
    nodeExecutable: process.execPath,
    cookiesFile: cookiePath
  });

  assert.ok(args.includes('--cookies'));
  assert.equal(args[args.indexOf('--cookies') + 1], cookiePath);
});
