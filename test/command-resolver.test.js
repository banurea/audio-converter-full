const test = require('node:test');
const assert = require('node:assert/strict');
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
    result.command === path.join(rootDir, 'yt-dlp.exe'),
    `unexpected resolution: ${JSON.stringify(result)}`
  );
});
