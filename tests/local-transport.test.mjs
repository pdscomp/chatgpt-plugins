import test from 'node:test';
import assert from 'node:assert/strict';
import {createTransport} from '../plugins/fusion360-local/server/transport.mjs';

const version = '2025-03-26';
const request = (id, method, params = {}) => ({jsonrpc:'2.0', id, method, params});
const json = (id, result, headers = {}) => new Response(JSON.stringify({jsonrpc:'2.0', id, result}),
  {headers:{'Content-Type':'application/json', ...headers}});

function harness(options = {}) {
  const state = {online:true, session:0, initialized:0, calls:[], effects:0, emitted:[], hook:undefined};
  const bridge = createTransport({emit: frame => state.emitted.push(frame), delay:async () => {},
    reconnectDelays:[0, 0, 0], ...options,
    fetchImpl: async (url, init) => {
      assert.equal(url, 'http://127.0.0.1:27182/mcp');
      const message = JSON.parse(init.body);
      state.calls.push({message, headers:init.headers});
      if (!state.online) throw new TypeError('Socket unavailable');
      if (message.method === 'initialize') {
        assert.equal(init.headers['Mcp-Session-Id'], undefined);
        assert.equal(init.headers['MCP-Protocol-Version'], undefined);
        state.session++;
        return json(message.id, {protocolVersion:version, capabilities:{tools:{}}, serverInfo:{name:'Fake Fusion', version:'1'}},
          {'Mcp-Session-Id':String(state.session)});
      }
      // Match Fusion's real behavior: ping succeeds even for a stale session.
      if (message.method === 'ping') return json(message.id, {});
      if (init.headers['Mcp-Session-Id'] !== String(state.session)) return new Response(null, {status:404});
      assert.equal(init.headers['MCP-Protocol-Version'], version);
      if (message.method === 'notifications/initialized') {
        state.initialized++;
        return new Response(null, {status:202});
      }
      if (state.hook) {
        const response = await state.hook(message, init);
        if (response) return response;
      }
      if (message.method === 'tools/call') state.effects++;
      if (!Object.hasOwn(message, 'id')) return new Response(null, {status:202});
      return json(message.id, message.method === 'tools/list' ? {tools:[{name:'example'}]} : {});
    }});
  state.bridge = bridge;
  state.start = () => bridge.handle(request(1, 'initialize', {protocolVersion:version, capabilities:{}, clientInfo:{name:'Test',version:'1'}}));
  state.reply = id => state.emitted.filter(frame => frame.id === id);
  return state;
}

test('initial lifecycle and internal preflight remain invisible to the host', async () => {
  const h = harness();
  await h.start();
  await h.bridge.handle({jsonrpc:'2.0',method:'notifications/initialized'});
  await h.bridge.handle(request(2, 'tools/call'));
  assert.equal(h.initialized, 1);
  assert.equal(h.effects, 1);
  assert.deepEqual(h.emitted.map(frame => frame.id), [1, 2]);
});

test('expired session is reinitialized before sending a model command', async () => {
  const h = harness();
  await h.start();
  h.session = 10; // Fusion restarted and forgot the original session.
  await h.bridge.handle(request(2, 'tools/call'));
  assert.equal(h.initialized, 2);
  const calls = h.calls.filter(call => call.message.method === 'tools/call');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].headers['Mcp-Session-Id'], '11');
  assert.equal(h.effects, 1);
  assert.ok(h.reply(2)[0].result);
});

test('lost command response is never replayed, and a later call reconnects', async () => {
  const h = harness();
  await h.start();
  h.hook = message => {
    if (message.method === 'tools/call') {
      h.effects++; // The model changed before the TCP response was lost.
      throw new TypeError('Response lost');
    }
  };
  await h.bridge.handle(request(2, 'tools/call'));
  assert.equal(h.effects, 1);
  assert.equal(h.reply(2).length, 1);
  assert.match(h.reply(2)[0].error.message, /not replayed/);
  h.hook = undefined;
  await h.bridge.handle(request(3, 'tools/call'));
  assert.equal(h.effects, 2);
  assert.equal(h.initialized, 2);
  assert.ok(h.reply(3)[0].result);
});

test('discovery retries after session expiry without leaking recovery responses', async () => {
  const h = harness();
  await h.start();
  h.session = 10;
  await h.bridge.handle(request(2, 'tools/list'));
  assert.equal(h.reply(2).length, 1);
  assert.equal(h.reply(2)[0].result.tools[0].name, 'example');
  assert.deepEqual(h.emitted.map(frame => frame.id), [1, 2]);
});

test('server can be unavailable at startup and come back without restarting bridge', async () => {
  const h = harness();
  h.online = false;
  await h.start();
  assert.ok(h.reply(1)[0].error);
  assert.equal(h.calls.length, 3); // Bounded connection attempts.
  h.online = true;
  await h.bridge.handle(request(2, 'tools/list'));
  assert.ok(h.reply(2)[0].result);
});

test('outage between calls recovers on the next request after Fusion returns', async () => {
  const h = harness();
  await h.start();
  h.online = false;
  await h.bridge.handle(request(2, 'tools/call'));
  assert.ok(h.reply(2)[0].error);
  assert.equal(h.effects, 0);
  h.online = true;
  await h.bridge.handle(request(3, 'tools/call'));
  assert.ok(h.reply(3)[0].result);
  assert.equal(h.effects, 1);
});

test('concurrent calls share a single reconnection handshake', async () => {
  const h = harness();
  await h.start();
  h.session = 10;
  await Promise.all([h.bridge.handle(request(2, 'tools/call')), h.bridge.handle(request(3, 'tools/call'))]);
  assert.equal(h.initialized, 2);
  assert.equal(h.effects, 2);
  assert.equal(h.reply(2).length, 1);
  assert.equal(h.reply(3).length, 1);
});

test('SSE handles split CRLF and UTF-8, forwards progress, and stops at result', async () => {
  const h = harness();
  await h.start();
  let cancelled = false;
  h.hook = message => {
    if (message.method !== 'tools/call') return;
    const text = 'data: ' + JSON.stringify({jsonrpc:'2.0',method:'notifications/progress',params:{message:'café'}}) + '\r\n\r\n' +
      'data: ' + JSON.stringify({jsonrpc:'2.0',id:message.id,result:{ok:true}}) + '\r\n\r\n';
    const bytes = new TextEncoder().encode(text);
    let offset = 0;
    return new Response(new ReadableStream({pull(controller) {
      if (offset < bytes.length) controller.enqueue(bytes.slice(offset, ++offset));
      // Deliberately leave the socket open after the response.
    }, cancel() {cancelled = true;}}), {headers:{'Content-Type':'text/event-stream'}});
  };
  await h.bridge.handle(request(2, 'tools/call'));
  assert.deepEqual(h.reply(2)[0].result, {ok:true});
  assert.equal(h.emitted.find(frame => frame.method === 'notifications/progress').params.message, 'café');
  assert.equal(cancelled, true);
});

test('truncated SSE response reports one error and reconnects on a later request', async () => {
  const h = harness();
  await h.start();
  h.hook = message => message.method === 'tools/call' ? new Response(': heartbeat\n\n', {headers:{'Content-Type':'text/event-stream'}}) : undefined;
  await h.bridge.handle(request(2, 'tools/call'));
  assert.equal(h.reply(2).length, 1);
  assert.match(h.reply(2)[0].error.message, /without a result/);
  h.hook = undefined;
  await h.bridge.handle(request(3, 'tools/list'));
  assert.equal(h.initialized, 2);
  assert.ok(h.reply(3)[0].result);
});

test('HTTP rejection after preflight does not replay the actual tool call', async () => {
  const h = harness();
  await h.start();
  h.hook = message => message.method === 'tools/call' ? new Response(null, {status:404}) : undefined;
  await h.bridge.handle(request(2, 'tools/call'));
  assert.equal(h.calls.filter(call => call.message.method === 'tools/call').length, 1);
  assert.match(h.reply(2)[0].error.message, /not replayed/);
});

test('non-transient rejection does not trigger a reconnection loop', async () => {
  const h = harness();
  await h.start();
  h.hook = message => message.method === 'tools/list' ? new Response(null, {status:401}) : undefined;
  await h.bridge.handle(request(2, 'tools/list'));
  assert.equal(h.initialized, 1);
  assert.match(h.reply(2)[0].error.message, /401/);
});

test('closing aborts in-flight work and emits no late error', async () => {
  const h = harness();
  await h.start();
  let started;
  const pending = new Promise(resolve => {started = resolve;});
  h.hook = (message, init) => {
    if (message.method !== 'tools/list') return;
    started();
    return new Promise((resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('Aborted')), {once:true}));
  };
  const call = h.bridge.handle(request(2, 'tools/list'));
  await pending;
  h.bridge.close();
  await call;
  assert.equal(h.reply(2).length, 0);
});

test('an old cancellation is not forwarded into a replacement session', async () => {
  const h = harness();
  await h.start();
  let started, finish;
  const pending = new Promise(resolve => {started = resolve;});
  h.hook = message => {
    if (message.method !== 'tools/call') return;
    started();
    return new Promise(resolve => {finish = () => resolve(json(message.id, {}));});
  };
  const call = h.bridge.handle(request(2, 'tools/call'));
  await pending;
  h.session = 10;
  await h.bridge.handle(request(3, 'tools/list'));
  await h.bridge.handle({jsonrpc:'2.0',method:'notifications/cancelled',params:{requestId:2}});
  assert.equal(h.calls.filter(call => call.message.method === 'notifications/cancelled').length, 0);
  finish();
  await call;
});

test('a JSON-RPC tool error is forwarded once without reconnecting or replaying', async () => {
  const h = harness();
  await h.start();
  h.hook = message => message.method === 'tools/call' ? new Response(JSON.stringify({jsonrpc:'2.0',id:message.id,error:{code:-32602,message:'Invalid input'}}), {headers:{'Content-Type':'application/json'}}) : undefined;
  await h.bridge.handle(request(2, 'tools/call'));
  assert.equal(h.reply(2).length, 1);
  assert.equal(h.reply(2)[0].error.code, -32602);
  assert.equal(h.initialized, 1);
});
