function buildYtDlpArgs({ url = '', extraArgs = [], nodeExecutable } = {}) {
  const args = ['--no-update'];

  if (String(url || '').match(/^https?:\/\/(www\.)?(youtube\.com|youtu\.be|music\.youtube\.com)\//i)) {
    args.push('--extractor-args', 'youtube:player_client=web');
    args.push('--extractor-args', 'youtube:player_skip=web');
    args.push('--js-runtimes', `node:${nodeExecutable || 'node'}`);
    args.push('--add-header', 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36');
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
