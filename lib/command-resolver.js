const fs = require('fs');
const path = require('path');

function resolveExecutableCommand(name, options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const platform = options.platform || process.platform;
  const candidates = [];

  if (options.preferPath !== false) {
    candidates.push({ command: name, isPath: false });
  }

  candidates.push({ command: path.join(rootDir, name), isPath: true });

  if (platform === 'win32') {
    const exe = name.endsWith('.exe') ? name : `${name}.exe`;
    candidates.push({ command: path.join(rootDir, exe), isPath: true });
    candidates.push({ command: exe, isPath: false });
  }

  for (const candidate of candidates) {
    if (!candidate?.command) continue;

    if (!candidate.isPath) {
      return { command: candidate.command, args: [] };
    }

    try {
      if (fs.existsSync(candidate.command)) {
        return { command: candidate.command, args: [] };
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
