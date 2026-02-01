const assert = require('assert');
const os = require('os');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { Readable } = require('stream');
const idx = require('../index.js');

async function test() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sptvortex-download-jitter-'));
  const dest = path.join(tmp, 'out.bin');

  // Fail first attempt, succeed second. Measure elapsed time to verify backoff with jitter.
  let attempts = 0;
  const origHttpsRequest = https.request;
  https.request = function (url, opts, cb) {
    attempts += 1;
    const req = {
      end: function () {
        process.nextTick(() => {
          if (attempts === 1) {
            req.emit('error', new Error('ECONNRESET'));
          } else {
            const res = new Readable();
            res._read = function () { this.push('ok'); this.push(null); };
            res.statusCode = 200;
            cb(res);
          }
        });
      },
      destroy: function () {},
      abort: function () {},
      on: function () {},
      emit: function (n, v) { if (n === 'error' && typeof this._onerror === 'function') this._onerror(v); },
    };
    req._onerror = null;
    req.on = function (k, fn) { if (k === 'error') this._onerror = fn; };
    return req;
  };

  // Stub Math.random to be deterministic (0.8)
  const origRand = Math.random;
  Math.random = () => 0.8;

  const start = Date.now();
  await idx.helpers.downloadAsset('https://fake/asset', dest, { retries: 2, timeoutMs: 2000, backoffBaseMs: 60, jitterFactor: 0.5 });
  const elapsed = Date.now() - start;

  // Expected backoff ~ base * (1 + jitter) where jitter = (2*0.8 -1)*0.5 = (1.6-1)*0.5 = 0.3 => backoff 60*1.3 = 78ms
  assert(elapsed >= 70, `Expected elapsed >=70ms (was ${elapsed})`);

  // cleanup
  Math.random = origRand;
  https.request = origHttpsRequest;
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}

  console.log('download-jitter.integration.test.js OK');
}

if (require.main === module) test();
module.exports = test;