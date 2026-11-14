import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const catalog = read(path.join(root, '.agents/plugins/marketplace.json'));
assert.equal(catalog.plugins.length, 2);
for (const entry of catalog.plugins) {
  const dir = path.resolve(root, entry.source.path);
  assert.ok(dir.startsWith(root + path.sep));
  const manifest = read(path.join(dir, 'plugin.json'));
  const legacy = read(path.join(dir, '.codex-plugin/plugin.json'));
  assert.equal(manifest.$schema, 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json');
  assert.equal(manifest.name, entry.name);
  assert.equal(manifest.version, legacy.version);
  assert.equal(manifest.description, legacy.description);
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  const info = manifest.extensions['com.openai'].interface;
  assert.ok(info.shortDescription.length <= 30);
  for (const field of ['logo', 'composerIcon']) {
    assert.equal(info[field], legacy.interface[field]);
    const asset = path.resolve(dir, info[field]);
    assert.ok(asset.startsWith(dir + path.sep));
    const png = fs.readFileSync(asset);
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
    assert.equal(width, height);
    assert.ok(width >= 48 && width <= 4096);
    assert.ok(png.length <= 5 * 1024 * 1024);
  }
  const mcp = read(path.join(dir, 'mcp.json'));
  const compat = read(path.join(dir, '.mcp.json'));
  assert.equal(mcp.$schema, 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json');
  assert.deepEqual(mcp.mcpServers, compat.mcpServers);
  for (const server of Object.values(mcp.mcpServers)) {
    if (server.type === 'stdio') {
      assert.equal(server.command, 'node');
      const script = server.args[0].replace('${PLUGIN_ROOT}/', '');
      execFileSync(process.execPath, ['--check', path.join(dir, script)], {stdio: 'inherit'});
    } else {
      assert.equal(server.type, 'streamable-http');
      assert.equal(server.url, 'https://developer.api.autodesk.com/fusion/mcp');
      const auth = server.extensions['com.openai'].auth;
      assert.equal(auth.type, 'oauth');
      assert.equal(auth.client.mode, 'cimd');
    }
  }
  console.log(`${entry.name} ${manifest.version}: package checks passed`);
}
