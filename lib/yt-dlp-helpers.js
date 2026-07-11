function isLikelyValidCookiesFile(filePath) {
  if (!filePath) return false;

  try {
    const fs = require('fs');
    const content = fs.readFileSync(filePath, 'utf8');
    if (!content || !content.trim()) return false;
    const trimmed = content.trim();
    return trimmed.startsWith('# Netscape HTTP Cookie File') || trimmed.includes('\tTRUE\t') || trimmed.includes('\tfalse\t') || trimmed.includes('\tTRUE\t') || trimmed.includes('\tFALSE\t');
  } catch (_) {
    return false;
  }
}

function buildYtDlpArgs({ url = '', extraArgs = [], nodeExecutable, cookiesFile } = {}) {
  const args = ['--no-update'];

  if (String(url || '').match(/^https?:\/\/(www\.)?(youtube\.com|youtu\.be|music\.youtube\.com)\//i)) {
    args.push('--extractor-args', 'youtube:player_client=web');
    args.push('--extractor-args', 'youtube:player_skip=web');
    args.push('--js-runtimes', `node:${nodeExecutable || 'node'}`);
    args.push('--add-header', 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36');

    if (cookiesFile && isLikelyValidCookiesFile(cookiesFile)) {
      args.push('--cookies', cookiesFile);
    }
  }

  return [...args, ...extraArgs];
}

function isYoutubeBotBlockedError(message = '') {
  const text = String(message || '').toLowerCase();
  return [
    'sign in to confirm',
    'not a bot',
    'could not find a javascript runtime',
    'javascript runtime',
    'browser cookies',
    'cookies',
    'bot',
    'age restricted',
    'private video',
    'unavailable video'
  ].some(token => text.includes(token));
}

function getFriendlyYoutubeError(message = '') {
  if (isYoutubeBotBlockedError(message)) {
    return 'YouTube memblokir ekstraksi dari server ini. Coba upload file audio langsung, gunakan link lain, atau gunakan file yang sudah Anda miliki.';
  }

  return message || 'Gagal mengambil audio dari URL yang diberikan.';
}

module.exports = {
  buildYtDlpArgs,
  isYoutubeBotBlockedError,
  getFriendlyYoutubeError
};
