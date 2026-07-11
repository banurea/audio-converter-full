const fs = require('fs');
const path = require('path');

function resolveExecutableCommand(name, options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const platform = options.platform || process.platform;
  const candidates = [];
  const exactLocal = path.join(rootDir, name);
  const exactName = name;

  candidates.push(exactLocal);

  if (platform === 'win32') {
    const exe = name.endsWith('.exe') ? name : `${name}.exe`;
    candidates.push(path.join(rootDir, exe));
    candidates.push(exe);
  }

  candidates.push(exactName);

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      if (fs.existsSync(candidate)) {
        return { command: candidate, args: [] };
      }
    } catch (_) {}
  }

  return { command: name, args: [] };
}

function resolveExecutable(name, options = {}) {
  const resolved = resolveExecutableCommand(name, options);
  return resolved.command;
}

module.exports = {
  resolveExecutableCommand,
  resolveExecutable
};
