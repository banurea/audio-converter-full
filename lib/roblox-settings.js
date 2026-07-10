const fs = require('fs');
const path = require('path');

function resolveSettingsFile(rootDir) {
  return path.join(rootDir, 'tmp', 'roblox-settings.json');
}

function readStoredSettings(rootDir, fsModule = fs) {
  const settingsFile = resolveSettingsFile(rootDir);
  if (!fsModule.existsSync(settingsFile)) {
    return {};
  }

  try {
    const raw = fsModule.readFileSync(settingsFile, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

function normalizeSettings(settings = {}) {
  return {
    apiKey: String(settings.apiKey ?? '').trim(),
    creatorId: String(settings.creatorId ?? '').trim(),
    creatorType: String(settings.creatorType ?? 'user').trim() || 'user',
    uploadUrl: String(settings.uploadUrl ?? '').trim(),
    setPermissionUrl: String(settings.setPermissionUrl ?? '').trim()
  };
}

function resolveRobloxSettings(settings = {}, { rootDir = process.cwd(), env = process.env, fsModule = fs } = {}) {
  const stored = readStoredSettings(rootDir, fsModule);
  return normalizeSettings({
    apiKey: settings.apiKey ?? env.ROBLOX_API_KEY ?? stored.apiKey ?? '',
    creatorId: settings.creatorId ?? env.ROBLOX_CREATOR_ID ?? stored.creatorId ?? '',
    creatorType: settings.creatorType ?? env.ROBLOX_CREATOR_TYPE ?? stored.creatorType ?? 'user',
    uploadUrl: settings.uploadUrl ?? env.ROBLOX_UPLOAD_URL ?? stored.uploadUrl ?? 'https://apis.roblox.com/assets/v1/assets',
    setPermissionUrl: settings.setPermissionUrl ?? env.ROBLOX_SET_PERMISSION_URL ?? stored.setPermissionUrl ?? ''
  });
}

function loadRobloxSettings({ rootDir = process.cwd(), env = process.env, fsModule = fs } = {}) {
  const merged = resolveRobloxSettings({}, { rootDir, env, fsModule });

  env.ROBLOX_API_KEY = merged.apiKey;
  env.ROBLOX_CREATOR_ID = merged.creatorId;
  env.ROBLOX_CREATOR_TYPE = merged.creatorType;
  env.ROBLOX_UPLOAD_URL = merged.uploadUrl || 'https://apis.roblox.com/assets/v1/assets';
  env.ROBLOX_SET_PERMISSION_URL = merged.setPermissionUrl || '';

  return merged;
}

function saveRobloxSettings(settings, { rootDir = process.cwd(), env = process.env, fsModule = fs } = {}) {
  const current = loadRobloxSettings({ rootDir, env, fsModule });
  const next = normalizeSettings({
    ...current,
    ...settings
  });

  const settingsFile = resolveSettingsFile(rootDir);
  fsModule.mkdirSync(path.dirname(settingsFile), { recursive: true });
  fsModule.writeFileSync(settingsFile, JSON.stringify(next, null, 2));

  env.ROBLOX_API_KEY = next.apiKey;
  env.ROBLOX_CREATOR_ID = next.creatorId;
  env.ROBLOX_CREATOR_TYPE = next.creatorType;
  env.ROBLOX_UPLOAD_URL = next.uploadUrl || 'https://apis.roblox.com/assets/v1/assets';
  env.ROBLOX_SET_PERMISSION_URL = next.setPermissionUrl || '';

  return next;
}

module.exports = {
  loadRobloxSettings,
  saveRobloxSettings,
  normalizeSettings,
  resolveSettingsFile,
  resolveRobloxSettings
};
