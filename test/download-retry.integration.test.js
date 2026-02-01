const assert = require('assert');
const os = require('os');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const https = require('https');
const { EventEmitter } = require('events');
const { Readable } = require('stream');
const idx = require('../index.js');

async function test() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sptvortex-download-retry-'));
  const dest = path.join(tmp, 'out.bin');

  // 1) Transient errors then success
  let attempts = 0;
  const origHttpsRequest = https.request;
  https.request = function (url, opts, cb) {
    const req = new EventEmitter();
    req.end = function () {
      attempts += 1;
      process.nextTick(() => {
        if (attempts < 3) {
          req.emit('error', new Error('ECONNRESET'));
        } else {
          const res = new Readable();
          res._read = function () { this.push('hello'); this.push(null); };
          res.statusCode = 200;
          cb(res);
        }
      });
    };
    req.destroy = function () { req.emit('error', new Error('destroyed')); };
    return req;
  };

  // run with retries=3
  await idx.helpers.downloadAsset('https://fake/asset', dest, { retries: 3, timeoutMs: 2000, backoffBaseMs: 10 });
  const content = fs.readFileSync(dest, 'utf8');
  assert(content === 'hello', 'expected content after retries');

  // restore
  https.request = origHttpsRequest;

  // 2) Timeout behavior
  const orig2 = https.request;
  https.request = function (url, opts, cb) {
    const req = new EventEmitter();
    req.end = function () {
      // never call cb nor emit any data -> will timeout
    };
    req.destroy = function () { req.emit('error', new Error('destroyed')); };
    return req;
  };

  let threw = false;
  try {
    await idx.helpers.downloadAsset('https://fake/asset', dest, { retries: 1, timeoutMs: 50, backoffBaseMs: 1 });
  } catch (e) {
    threw = true;
    assert(e && (e.code === 'DOWNLOAD_TIMEOUT' || /DOWNLOAD_TIMEOUT/.test(String(e.message)) || e.code === 'DOWNLOAD_RETRIES_EXHAUSTED'));
  }
  assert(threw, 'Expected timeout to cause error');

  // restore
  https.request = orig2;

  // cleanup
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}

  console.log('download-retry.integration.test.js OK');
}

if (require.main === module) test();
module.exports = test;