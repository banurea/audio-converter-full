const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { resolveExecutableCommand } = require('../lib/command-resolver');

test('resolveExecutableCommand returns a usable command for yt-dlp', () => {
  const rootDir = path.resolve(__dirname, '..');
  const result = resolveExecutableCommand('yt-dlp', { rootDir, platform: process.platform });

  assert.ok(result, 'should return a command resolution');
  assert.ok(typeof result.command === 'string' && result.command.length > 0, 'command should be a non-empty string');
  assert.ok(
    result.command === 'yt-dlp' ||
    result.command === path.join(rootDir, 'yt-dlp') ||
    result.command === path.join(rootDir, 'yt-dlp.exe') ||
    result.command.endsWith(`${path.sep}yt-dlp`) ||
    result.command.endsWith(`${path.sep}yt-dlp.exe`),
    `unexpected resolution: ${JSON.stringify(result)}`
  );
});

test('resolveExecutableCommand prefers a PATH executable when present', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cmd-resolver-'));
  const fakeBinary = path.join(tempDir, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
  fs.writeFileSync(fakeBinary, '#!/bin/sh\nexit 0\n');
  fs.chmodSync(fakeBinary, 0o755);

  const result = resolveExecutableCommand('yt-dlp', {
    rootDir: tempDir,
    platform: process.platform,
    envPath: tempDir
  });

  assert.equal(result.command, fakeBinary);
});
