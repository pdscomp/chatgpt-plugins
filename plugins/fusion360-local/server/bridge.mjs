import readline from 'node:readline';
import {createTransport} from './transport.mjs';

const transport = createTransport({
  emit: message => process.stdout.write(JSON.stringify(message) + '\n'),
  log: message => process.stderr.write(`Fusion360 bridge: ${message}\n`),
});
const input = readline.createInterface({input: process.stdin, crlfDelay: Infinity});
let initialization = Promise.resolve();
input.on('line', line => {
  if (!line.trim()) return;
  let message;
  try { message = JSON.parse(line); }
  catch { process.stdout.write(JSON.stringify({jsonrpc:'2.0', id:null, error:{code:-32700, message:'Invalid JSON'}}) + '\n'); return; }
  // Serialize lifecycle messages; let cancellation and progress flow during calls.
  const task = initialization.then(() => transport.handle(message));
  if (message?.method === 'initialize' || message?.method === 'notifications/initialized') initialization = task;
});
input.on('close', () => transport.close());
