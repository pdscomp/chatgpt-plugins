import {randomUUID} from 'node:crypto';
import {setTimeout as sleep} from 'node:timers/promises';

const endpoint = 'http://127.0.0.1:27182/mcp';
const retryableReads = new Set(['ping', 'tools/list', 'resources/list', 'resources/templates/list', 'resources/read', 'prompts/list', 'prompts/get']);

class TransportError extends Error {
  constructor(message, {retryable = false} = {}) {
    super(message);
    this.retryable = retryable;
  }
}

// Own the upstream HTTP lifecycle independently of the host's stdio lifecycle.
// Never replay a tools/call after an uncertain outcome.
export function createTransport({emit, log = () => {}, fetchImpl = fetch,
  delay = sleep, reconnectDelays = [0, 200, 500, 1000],
  connectTimeoutMs = 2000, requestTimeoutMs = 300000} = {}) {
  let initParams;
  let negotiatedProtocol;
  let active;
  let connecting;
  let closed = false;
  const controllers = new Set();
  const requests = new Map();
  const serverRequests = new Map();
  const lifetime = new AbortController();
  const internalId = () => `fusion-bridge-${randomUUID()}`;
  const invalidate = session => { if (active === session) active = undefined; };

  async function send(session, message, {internal = false, timeout = requestTimeoutMs} = {}) {
    const controller = new AbortController();
    controllers.add(controller);
    const timer = setTimeout(() => controller.abort(), timeout);
    const headers = {'Content-Type': 'application/json', Accept: 'application/json, text/event-stream'};
    if (session.id) headers['Mcp-Session-Id'] = session.id;
    if (session.protocol) headers['MCP-Protocol-Version'] = session.protocol;
    let responseMessage;
    const expectsResponse = Object.hasOwn(message, 'id') && typeof message.method === 'string';
    if (expectsResponse && !internal) requests.set(message.id, session);
    const accept = value => {
      for (const frame of Array.isArray(value) ? value : [value]) {
        const matches = expectsResponse && frame?.id === message.id && !frame.method;
        if (matches) {
          if (responseMessage) continue;
          responseMessage = frame;
        }
        if (frame?.method && Object.hasOwn(frame, 'id')) serverRequests.set(frame.id, session);
        if (!internal || !matches) emit(frame);
      }
    };
    try {
      let response;
      try {
        response = await fetchImpl(endpoint, {method:'POST', headers,
          body:JSON.stringify(message), redirect:'error', signal:controller.signal});
      } catch {
        throw new TransportError('Connection to local Fusion was interrupted or timed out.', {retryable:true});
      }
      if (!response.ok) {
        await response.body?.cancel();
        const expired = response.status === 404 && Boolean(session.id);
        throw new TransportError(expired ? 'Fusion session expired.' : `Fusion HTTP ${response.status}.`,
          {retryable:expired || response.status >= 500});
      }
      if (message.method === 'initialize') session.id = response.headers.get('mcp-session-id') || undefined;
      if (response.status !== 202 && response.status !== 204) {
        if (response.headers.get('content-type')?.includes('text/event-stream')) {
          const decoder = new TextDecoder();
          let pending = '';
          const event = block => {
            const data = block.split(/\r?\n/).filter(line => line.startsWith('data:'))
              .map(line => line.slice(5).replace(/^ /, '')).join('\n');
            if (data) accept(JSON.parse(data));
          };
          for await (const chunk of response.body) {
            pending += decoder.decode(chunk, {stream:true});
            let boundary;
            while ((boundary = /\r?\n\r?\n/.exec(pending))) {
              event(pending.slice(0, boundary.index));
              pending = pending.slice(boundary.index + boundary[0].length);
              // Some servers leave the SSE socket open after sending a result.
              if (responseMessage) return responseMessage;
            }
          }
          pending += decoder.decode();
          if (pending.trim()) event(pending);
        } else {
          const body = await response.text();
          if (body.trim()) accept(JSON.parse(body));
        }
      }
      if (expectsResponse && !responseMessage) throw new TransportError('Fusion closed the response without a result.', {retryable:true});
      return responseMessage;
    } catch (error) {
      if (error instanceof TransportError) throw error;
      throw new TransportError('Fusion returned an incomplete or invalid response.', {retryable:true});
    } finally {
      clearTimeout(timer);
      controllers.delete(controller);
      if (expectsResponse && !internal && requests.get(message.id) === session) requests.delete(message.id);
    }
  }

  async function connect() {
    let lastError;
    for (const wait of reconnectDelays) {
      if (closed) throw new Error('Bridge closed.');
      if (wait) await delay(wait, undefined, {signal:lifetime.signal});
      const session = {};
      try {
        const params = {...initParams};
        if (negotiatedProtocol) params.protocolVersion = negotiatedProtocol;
        const result = await send(session, {jsonrpc:'2.0', id:internalId(), method:'initialize', params}, {internal:true, timeout:connectTimeoutMs});
        if (result.error) throw new Error(`Fusion initialization failed: ${result.error.message}`);
        const protocol = result.result?.protocolVersion;
        if (!protocol || (negotiatedProtocol && protocol !== negotiatedProtocol)) throw new Error('Fusion protocol changed. Reload the plugin to negotiate a new protocol.');
        session.protocol = protocol;
        await send(session, {jsonrpc:'2.0', method:'notifications/initialized'}, {internal:true, timeout:connectTimeoutMs});
        if (closed) throw new Error('Bridge closed.');
        negotiatedProtocol = protocol;
        active = session;
        session.initializeResult = result.result;
        return session;
      } catch (error) {
        lastError = error;
        if (!error.retryable) break;
      }
    }
    throw new Error(`${lastError?.message || 'Cannot connect to Fusion.'} Keep Fusion and its MCP add-in running; the next request will reconnect automatically.`);
  }

  async function ensureSession() {
    if (closed) throw new Error('Bridge closed.');
    if (active) return active;
    if (!initParams) throw new Error('Initialize the bridge before sending requests.');
    if (!connecting) connecting = connect().finally(() => { connecting = undefined; });
    return connecting;
  }

  async function healthySession() {
    const session = await ensureSession();
    // Share preflight among concurrent commands; only handshake traffic is retried.
    if (!session.healthCheck) {
      // Fusion answers ping even for an expired session. tools/list validates
      // the actual session without executing a model operation.
      session.healthCheck = send(session, {jsonrpc:'2.0', id:internalId(), method:'tools/list'},
        {internal:true, timeout:connectTimeoutMs}).then(reply => {
        if (reply.error) throw new Error(`Fusion health check failed: ${reply.error.message}`);
        return session;
      }).catch(async error => {
        invalidate(session);
        if (!error.retryable) throw error;
        return ensureSession();
      }).finally(() => { session.healthCheck = undefined; });
    }
    return session.healthCheck;
  }

  async function handle(message) {
    if (!message || Array.isArray(message) || message.jsonrpc !== '2.0' ||
        (typeof message.method !== 'string' && !Object.hasOwn(message, 'id'))) {
      emit({jsonrpc:'2.0', id:null, error:{code:-32600, message:'Invalid JSON-RPC message'}});
      return;
    }
    try {
      if (message.method === 'initialize') {
        initParams = structuredClone(message.params);
        const session = await ensureSession();
        emit({jsonrpc:'2.0', id:message.id, result:session.initializeResult});
        return;
      }
      // The upstream initialized notification was sent during connect().
      if (message.method === 'notifications/initialized') return;
      // Notifications and responses belong to their original session: never
      // deliver old cancellations or replies into a replacement session.
      if (!message.method || !Object.hasOwn(message, 'id')) {
        if (!active) return;
        const session = active;
        if (message.method === 'notifications/cancelled' && requests.get(message.params?.requestId) !== session) return;
        if (!message.method) {
          const original = serverRequests.get(message.id);
          serverRequests.delete(message.id);
          if (original !== session) return;
        }
        try { await send(session, message); }
        catch (error) { if (error.retryable) invalidate(session); throw error; }
        return;
      }
      const session = message.method === 'tools/call' ? await healthySession() : await ensureSession();
      try {
        await send(session, message);
      } catch (error) {
        if (error.retryable) invalidate(session);
        if (error.retryable && retryableReads.has(message.method)) {
          const replacement = await ensureSession();
          try { await send(replacement, message); }
          catch (retryError) { if (retryError.retryable) invalidate(replacement); throw retryError; }
        } else {
          const suffix = message.method === 'tools/call' ? ' The tool call was not replayed; check its outcome before trying it again.' : '';
          throw new Error(error.message + suffix);
        }
      }
    } catch (error) {
      if (closed) return;
      if (message.method && Object.hasOwn(message, 'id')) emit({jsonrpc:'2.0', id:message.id, error:{code:-32000, message:error.message}});
      else log(error.message);
    }
  }

  return {handle, close() {
    closed = true;
    active = undefined;
    lifetime.abort();
    for (const controller of controllers) controller.abort();
  }};
}
