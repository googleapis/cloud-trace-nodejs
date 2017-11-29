/**
 * Copyright 2017 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const common = require('./common');

require('../../..').start({
  projectId: '0',
  samplingRate: 0,
});

import * as assert from 'assert';
import * as http2 from 'http2';
import * as semver from 'semver';
import * as stream from 'stream';

import {Constants} from '../../src/constants';
import {TraceLabels} from '../../src/trace-labels';
import {TraceSpan} from '../../src/trace-span';

describe('test-trace-http2', () => {
  if (semver.satisfies(process.version, '<8')) {
    console.log(
        'Skipping test-trace-http2 on Node.js version ' + process.version);
    return;
  }

  let server: http2.Http2Server;

  before(() => {
    server = http2.createServer();
    server.on('stream', (s) => {
      setTimeout(() => {
        s.respond({':status': 200});
        s.end(common.serverRes);
      }, common.serverWait);
    });
  });

  afterEach(() => {
    common.cleanTraces();
    server.close();
  });

  it('should patch the necessary functions', () => {
    assert.strictEqual(http2.connect['__wrapped'], true);
  });

  it('should accurately measure request time', (done) => {
    server.listen(common.serverPort, () => {
      common.runInTransaction((endTransaction: () => void) => {
        const start = Date.now();
        const session = http2.connect(`http://localhost:${common.serverPort}`);
        const s = session.request({':path': '/'});
        s.setEncoding('utf8');
        let result = '';
        s.on('data', (data: string) => {
           result += data;
         }).on('end', () => {
          endTransaction();
          assert.equal(result, common.serverRes);
          common.assertDurationCorrect(Date.now() - start);
          session.destroy();
          done();
        });
        s.end();
      });
    });
  });

  it('should propagate context', (done) => {
    server.listen(common.serverPort, () => {
      common.runInTransaction((endTransaction: () => void) => {
        const session = http2.connect(`http://localhost:${common.serverPort}`);
        const s = session.request({':path': '/'});
        s.on('data', () => {
           assert.ok(common.hasContext());
         }).on('end', () => {
          assert.ok(common.hasContext());
          endTransaction();
          session.destroy();
          done();
        });
        s.end();
      });
    });
  });

  it('should not trace api requests', (done) => {
    server.listen(common.serverPort, () => {
      common.runInTransaction((endTransaction: () => void) => {
        const session = http2.connect(`http://localhost:${common.serverPort}`);
        const headers: http2.OutgoingHttpHeaders = {':path': '/'};
        headers[Constants.TRACE_AGENT_REQUEST_HEADER] = 'yay';
        const s = session.request(headers);
        s.end();
        setTimeout(() => {
          endTransaction();
          const traces = common.getTraces();
          assert.equal(traces.length, 1);
          // The only span present should be the outer span.
          assert.equal(traces[0].spans.length, 1);
          assert.equal(traces[0].spans[0].name, 'outer');
          session.destroy();
          done();
        }, common.serverWait * 1.5);
      });
    });
  });

  it('should leave request streams in paused mode', (done) => {
    server.listen(common.serverPort, () => {
      common.runInTransaction((endTransaction: () => void) => {
        const start = Date.now();
        const session = http2.connect(`http://localhost:${common.serverPort}`);
        const s = session.request({':path': '/'});
        let result = '';
        const writable = new stream.Writable();
        writable._write = (chunk, encoding, next) => {
          result += chunk;
          next();
        };
        writable.on('finish', () => {
          endTransaction();
          assert.equal(result, common.serverRes);
          common.assertDurationCorrect(Date.now() - start);
          session.destroy();
          done();
        });
        setImmediate(() => {
          s.pipe(writable);
        });
        s.end();
      });
    });
  });

  it('should not include query parameters in span name', (done) => {
    server.listen(common.serverPort, () => {
      common.runInTransaction((endTransaction: () => void) => {
        const session = http2.connect(`http://localhost:${common.serverPort}`);
        const s = session.request({':path': '/?foo=bar'});
        s.end();
        setTimeout(() => {
          endTransaction();
          const traces = common.getTraces();
          assert.equal(traces.length, 1);
          assert.equal(traces[0].spans[1].name, 'localhost');
          session.destroy();
          done();
        }, common.serverWait * 1.5);
      });
    });
  });

  it('custom port number must be included in the url label', (done) => {
    server.listen(common.serverPort, () => {
      common.runInTransaction((endTransaction: () => void) => {
        const session = http2.connect(`http://localhost:${common.serverPort}`);
        const s = session.request({':path': '/'});
        s.end();
        setTimeout(() => {
          endTransaction();
          const traces = common.getTraces();
          assert.equal(traces.length, 1);
          assert.equal(
              traces[0].spans[1].labels['/http/url'],
              `http://localhost:${common.serverPort}/`);
          session.destroy();
          done();
        }, common.serverWait * 1.5);
      });
    });
  });

  it('should accurately measure request time, error', (done) => {
    const server = http2.createServer();
    server.on('stream', (s) => {
      s.rstWithInternalError();
    });
    server.listen(common.serverPort, () => {
      common.runInTransaction((endTransaction: () => void) => {
        const start = Date.now();
        const session = http2.connect(`http://localhost:${common.serverPort}`);
        const s = session.request({':path': '/'});
        s.on('error', () => {
          endTransaction();
          common.assertDurationCorrect(Date.now() - start);
          const span = common.getMatchingSpan((span: TraceSpan) => {
            return span.name !== 'outer';
          });
          assert.equal(
              span.labels[TraceLabels.ERROR_DETAILS_NAME],
              'Error [ERR_HTTP2_STREAM_ERROR]');
          assert.equal(
              span.labels[TraceLabels.ERROR_DETAILS_MESSAGE],
              'Stream closed with error code 2');
          session.destroy();
          server.close();
          done();
        });
        s.end();
      });
    });
  });

  it('should accurately measure request time, event emitter', (done) => {
    server.listen(common.serverPort, () => {
      common.runInTransaction((endTransaction: () => void) => {
        const start = Date.now();
        const session = http2.connect(`http://localhost:${common.serverPort}`);
        const s = session.request({':path': '/'});
        s.setEncoding('utf8');
        s.on('response', () => {
          let result = '';
          s.on('data', (data) => {
             result += data;
           }).on('end', () => {
            endTransaction();
            assert.equal(result, common.serverRes);
            common.assertDurationCorrect(Date.now() - start);
            session.destroy();
            done();
          });
        });
      });
    });
  });

  it('should handle concurrent requests', function(done) {
    this.timeout(10000);  // this test takes a long time
    let count = 200;
    const slowServer = http2.createServer();
    slowServer.on('stream', (s) => {
      setTimeout(() => {
        s.respond({':status': count++});
        s.end();
      }, 5000);
    });
    slowServer.listen(common.serverPort, () => {
      common.runInTransaction((endTransaction: () => void) => {
        let completed = 0;
        for (let i = 0; i < 5; i++) {
          const session =
              http2.connect(`http://localhost:${common.serverPort}`);
          const s = session.request({':path': '/'});
          s.on('data', () => {}).on('end', () => {
            if (++completed === 5) {
              endTransaction();
              const spans = common.getMatchingSpans((span: TraceSpan) => {
                return span.name !== 'outer';
              });
              assert.equal(spans.length, 5);
              // We need to check a property attached at the end of a span.
              const statusCodes: number[] = [];
              for (let j = 0; j < spans.length; j++) {
                const code = Number(
                    spans[j].labels[TraceLabels.HTTP_RESPONSE_CODE_LABEL_KEY]);
                assert.equal(statusCodes.indexOf(code), -1);
                statusCodes.push(code);
              }
              assert.equal(statusCodes.reduce((a, b) => a + b), 1010);
              slowServer.close();
              done();
            }
            session.destroy();
          });
          s.end();
        }
      });
    });
  });
});

describe('test-trace-secure-http2', () => {
  if (semver.satisfies(process.version, '<8')) {
    console.log(
        'Skipping test-trace-secure-http2 on Node.js version ' +
        process.version);
    return;
  }

  afterEach(() => {
    common.cleanTraces();
  });

  it('should accurately measure request time', (done) => {
    const options: http2.SecureServerOptions = {
      key: common.serverKey,
      cert: common.serverCert,
    };
    const secureServer = http2.createSecureServer(options);
    secureServer.on('stream', (s) => {
      setTimeout(() => {
        s.respond({':status': 200});
        s.end(common.serverRes);
      }, common.serverWait);
    });
    secureServer.listen(common.serverPort, () => {
      common.runInTransaction((endTransaction: () => void) => {
        const start = Date.now();
        const session = http2.connect(
            `https://localhost:${common.serverPort}`,
            {rejectUnauthorized: false});
        const s = session.request({':path': '/'});
        s.setEncoding('utf8');
        let result = '';
        s.on('data', (data: string) => {
           result += data;
         }).on('end', () => {
          endTransaction();
          assert.equal(result, common.serverRes);
          common.assertDurationCorrect(Date.now() - start);
          session.destroy();
          secureServer.close();
          done();
        });
        s.end();
      });
    });
  });
});
