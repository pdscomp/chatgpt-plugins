import readline from 'node:readline';

// Local stdio-to-Streamable-HTTP bridge. No listener or public tunnel is opened.
const endpoint = 'http://127.0.0.1:27182/mcp';
let session;
let protocol;
const emit = message => process.stdout.write(JSON.stringify(message) + '\n');

async function forward(message) {
  const headers = {'Content-Type': 'application/json', Accept: 'application/json, text/event-stream'};
  if (session) headers['Mcp-Session-Id'] = session;
  if (protocol) headers['MCP-Protocol-Version'] = protocol;
  const response = await fetch(endpoint, {
    method: 'POST', headers, body: JSON.stringify(message),
    redirect: 'error', signal: AbortSignal.timeout(300000),
  });
  if (!response.ok) throw new Error(`Fusion360 HTTP ${response.status}. Ensure Fusion and its MCP add-in are running. Requests are never automatically replayed.`);
  const nextSession = response.headers.get('mcp-session-id');
  if (nextSession) session = nextSession;
  const accept = data => {
    const result = JSON.parse(data);
    if (message.method === 'initialize' && result.result?.protocolVersion) protocol = result.result.protocolVersion;
    emit(result);
  };
  if (response.status === 202 || response.status === 204) return;
  if (response.headers.get('content-type')?.includes('text/event-stream')) {
    const decoder = new TextDecoder();
    let pending = '';
    for await (const chunk of response.body) {
      pending += decoder.decode(chunk, {stream: true}).replace(/\r\n/g, '\n');
      let boundary;
      while ((boundary = pending.indexOf('\n\n')) !== -1) {
        const event = pending.slice(0, boundary);
        pending = pending.slice(boundary + 2);
        const data = event.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
        if (data) accept(data);
      }
    }
  } else {
    const body = await response.text();
    if (body.trim()) accept(body);
  }
}

const input = readline.createInterface({input: process.stdin, crlfDelay: Infinity});
// Forward independently so cancellation and progress notifications can pass during a call.
let initialized = Promise.resolve();
input.on('line', line => {
  if (!line.trim()) return;
  let message;
  try { message = JSON.parse(line); }
  catch { emit({jsonrpc:'2.0', id:null, error:{code:-32700, message:'Invalid JSON'}}); return; }
  const task = initialized.then(() => forward(message)).catch(error => {
    if (Object.hasOwn(message, 'id')) emit({jsonrpc:'2.0', id:message.id, error:{code:-32000, message:error.message}});
    else process.stderr.write(`Fusion360 bridge: ${error.message}\n`);
  });
  if (message.method === 'initialize' || message.method === 'notifications/initialized') initialized = task;
});
