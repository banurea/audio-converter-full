const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { resolveExecutableCommand } = require('../lib/command-resolver');

test('resolveExecutableCommand uses the local yt-dlp script when it exists', () => {
  const rootDir = path.resolve(__dirname, '..');
  const result = resolveExecutableCommand('yt-dlp', { rootDir, platform: process.platform });
  const localScript = path.join(rootDir, 'yt-dlp');

  assert.ok(result, 'should return a command resolution');
  assert.ok(
    result.command === localScript || result.command === 'yt-dlp',
    `unexpected resolution: ${JSON.stringify(result)}`
  );
});
