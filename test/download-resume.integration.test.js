const assert = require('assert');
const os = require('os');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const https = require('https');
const { Readable } = require('stream');
const idx = require('../index.js');

async function test() {
  process.env.SPTVORTEX_TEST_DEBUG = '1';
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sptvortex-download-resume-'));
  const dest = path.join(tmp, 'out.bin');

  // Simulate server that supports Range. On first request, sends first half and then errors.
  // On second request with Range header, sends remaining half with 206.
  const contentFull = Buffer.from('abcdefghijklmnopqrstuvwxyz');
  const half = Math.floor(contentFull.length / 2);

  let requestCount = 0;
  const origHttpsRequest = https.request;
  https.request = function (url, opts, cb) {
    requestCount += 1;
    const req = {
      headers: opts && opts.headers ? opts.headers : {},
      end: function () {
        process.nextTick(() => {
          if (requestCount === 1) {
            // send first half then error (do not end stream) to simulate mid-transfer disconnect
            const res = new Readable();
            let pushed = false;
            res._read = function () { if (!pushed) { pushed = true; this.push(contentFull.slice(0, half)); } /* do not push null -> keep stream open until error */ };
            res.statusCode = 200; // server didn't treat as range, but it's fine for initial attempt
            cb(res);
            // simulate disconnect after a short delay before stream ends (allow data to flush)
            setTimeout(() => {
              // debug: inspect partial file size
              try {
                const st = fs.statSync(dest);
                console.log('[test] partial file size after interrupted download:', st.size);
              } catch (e) { console.log('[test] partial file not present yet'); }
              req.emit('error', new Error('ECONNRESET'));
            }, 10);
          } else {
            // check headers.Range expected
            const range = (opts && opts.headers && opts.headers.Range) ? opts.headers.Range : null;
            assert(range, 'Expected Range header on retry');
            // parse start
            const m = /bytes=(\d+)-/.exec(range);
            assert(m, 'Range header parse');
            const start = parseInt(m[1], 10);
            const res = new Readable();
            res._read = function () { this.push(contentFull.slice(start)); this.push(null); };
            res.statusCode = 206;
            cb(res);
          }
        });
      },
      destroy: function () {},
      abort: function () {},
      on: function () {},
      emit: function (n, v) { if (n === 'error' && typeof this._onerror === 'function') this._onerror(v); },
    };
    // emulate EventEmitter behavior for error handling
    req._onerror = null;
    req.on = function (k, fn) { if (k === 'error') this._onerror = fn; };
    return req;
  };

  // Run download with retries and resume enabled
  await idx.helpers.downloadAsset('https://fake/asset', dest, { retries: 3, timeoutMs: 2000, backoffBaseMs: 10, jitterFactor: 0, resume: true });

  const result = fs.readFileSync(dest);
  // debug
  console.log('result len', result.length, 'expected len', contentFull.length);
  console.log('result:', result.toString());
  assert(result.toString() === contentFull.toString(), 'Expected full content after resume');

  // restore
  https.request = origHttpsRequest;

  // cleanup
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}

  console.log('download-resume.integration.test.js OK');
}

if (require.main === module) test();
module.exports = test;