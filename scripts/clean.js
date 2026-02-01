#!/usr/bin/env node
const fs = require('fs').promises;
const path = require('path');

const targets = ['dist', 'build', 'coverage', 'test/output', 'logs'];

(async function main() {
  for (const t of targets) {
    const p = path.join(process.cwd(), t);
    try {
      await fs.rm(p, { recursive: true, force: true });
      console.log(`Removed: ${p}`);
    } catch (e) {
      // ignore errors: target may not exist
    }
  }
  console.log('Clean complete.');
})();
