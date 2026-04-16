'use strict';

const fs = require('fs');
const path = require('path');
const { isDeepStrictEqual } = require('util');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function mergeDefaults(defaults, value) {
  if (Array.isArray(defaults)) {
    return Array.isArray(value) ? value : clone(defaults);
  }

  if (!isPlainObject(defaults)) {
    return value == null ? defaults : value;
  }

  const input = isPlainObject(value) ? value : {};
  const merged = {};

  for (const key of Object.keys(defaults)) {
    merged[key] = mergeDefaults(defaults[key], input[key]);
  }

  for (const [key, child] of Object.entries(input)) {
    if (!(key in merged)) merged[key] = child;
  }

  return merged;
}

class JsonStore {
  constructor(options) {
    this.filePath = options.filePath;
    this.defaults = clone(options.defaults);
    this.migrate = options.migrate || ((value) => mergeDefaults(this.defaults, value));
    this.queue = Promise.resolve();
    this.cache = null;
    this.ready = this.initialize();
  }

  async initialize() {
    await fs.promises.mkdir(path.dirname(this.filePath), { recursive: true });
    await this.cleanupTempFiles();
    const { value: diskValue, needsWrite } = await this.readFromDisk();
    const state = this.normalize(diskValue);
    if (needsWrite || !isDeepStrictEqual(state, diskValue)) {
      await this.atomicWrite(state);
    }
    this.cache = state;
  }

  normalize(value) {
    return this.migrate(value, clone(this.defaults));
  }

  async readFromDisk() {
    try {
      const raw = await fs.promises.readFile(this.filePath, 'utf8');
      if (!raw.trim()) {
        return {
          value: clone(this.defaults),
          needsWrite: true,
        };
      }
      return {
        value: JSON.parse(raw),
        needsWrite: false,
      };
    } catch (error) {
      if (error.code === 'ENOENT') {
        return {
          value: clone(this.defaults),
          needsWrite: true,
        };
      }
      if (error instanceof SyntaxError) {
        const backupPath = `${this.filePath}.${Date.now()}.broken`;
        try {
          await fs.promises.copyFile(this.filePath, backupPath);
        } catch (_copyError) {
          // Ignore backup failures so the app can recover with safe defaults.
        }
        return {
          value: clone(this.defaults),
          needsWrite: true,
        };
      }
      throw error;
    }
  }

  async atomicWrite(value) {
    const tempPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    const serialized = JSON.stringify(value, null, 2);
    await fs.promises.writeFile(tempPath, serialized);
    await fs.promises.rename(tempPath, this.filePath);
  }

  async cleanupTempFiles() {
    const directory = path.dirname(this.filePath);
    const fileName = path.basename(this.filePath);
    const entries = await fs.promises.readdir(directory);

    await Promise.all(entries
      .filter((entry) => entry.startsWith(`${fileName}.`) && entry.endsWith('.tmp'))
      .map((entry) => fs.promises.unlink(path.join(directory, entry)).catch(() => {})));
  }

  async get() {
    await this.ready;
    await this.queue;
    return clone(this.cache);
  }

  async set(value) {
    return this.update(() => value);
  }

  async update(mutator) {
    await this.ready;
    const run = async () => {
      const current = clone(this.cache);
      const nextValue = await mutator(current);
      const normalized = this.normalize(nextValue);
      await this.atomicWrite(normalized);
      this.cache = normalized;
      return clone(this.cache);
    };

    this.queue = this.queue.then(run, run);
    return this.queue;
  }
}

module.exports = {
  JsonStore,
  mergeDefaults,
};
