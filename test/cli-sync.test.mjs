// Two devices, one sync server: write on one, read on the other.
//
// Needs sync-kit's server built (sync-kit/server/dist/index.js in the toolkit).
// Point FLOW_SYNC_SERVER at its index.js, or keep the toolkit beside this repo;
// without it the test is skipped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';

const CLI = new URL('../cli/flow.mjs', import.meta.url).pathname;
const repo = resolve(dirname(CLI), '..');
const SERVER = [
  process.env.FLOW_SYNC_SERVER,
  join(repo, '..', 'sync-kit', 'server', 'dist', 'index.js'),
  join(repo, '..', 'toolkit', 'sync-kit', 'server', 'dist', 'index.js'),
].find((p) => p && existsSync(p));

const SECRET = 'flow-cli-secret-123';

const freePort = () => new Promise((ok, fail) => {
  const s = createServer().listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => ok(port)); }).on('error', fail);
});

async function startServer(port) {
  const child = spawn(process.execPath, [SERVER], {
    cwd: resolve(dirname(SERVER), '..'),
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', STORAGE: 'memory', SYNC_TOKENS: JSON.stringify([{ workspace: 'flow', label: 'cli', secret: SECRET }]) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  await new Promise((ok, fail) => {
    const timer = setTimeout(() => fail(new Error(`sync server did not start:\n${log}`)), 10000);
    const seen = (b) => { log += b; if (log.includes('listening')) { clearTimeout(timer); ok(); } };
    child.stdout.on('data', seen);
    child.stderr.on('data', seen);
    child.on('exit', (code) => { clearTimeout(timer); fail(new Error(`sync server exited ${code}:\n${log}`)); });
  });
  child.removeAllListeners('exit');
  return child;
}

test('two devices converge through the sync server', { skip: SERVER ? false : 'sync-kit server not found (set FLOW_SYNC_SERVER)' }, async () => {
  const port = await freePort();
  const server = await startServer(port);
  const homes = [mkdtempSync(join(tmpdir(), 'flow-a-')), mkdtempSync(join(tmpdir(), 'flow-b-'))];
  const cli = (home) => async (...args) => {
    const env = { ...process.env, FLOW_HOME: home, TZ: 'UTC', FLOW_NOW: '2026-09-28T18:00:00Z' };
    delete env.FLOW_OFFLINE;
    const { stdout, stderr } = await promisify(execFile)('node', [CLI, ...args], { encoding: 'utf8', env });
    assert.doesNotMatch(stderr, /sync failed/, stderr);
    return stdout;
  };
  const [a, b] = homes.map(cli);
  try {
    const url = `http://127.0.0.1:${port}/w/flow`;
    for (const run of [a, b]) assert.match(await run('config', '--url', url, '--token', SECRET), /Token: set \(hidden\)/);

    await a('init', '--name', 'Allen', '--stats', 'Body,Mind,Work');
    await a('skill', 'add', '--name', 'Procurement', '--stat', 'work');
    await a('task', 'add', '--title', 'Purchase request', '--skill', 'procure', '--estimate', '20');
    await a('reward', 'add', '--title', 'Coffee', '--price', '15');
    assert.match(await a('done', 'purchase', '--minutes', '18', '--at', '09:00'), /\+20 pts/);

    // Device B syncs before it reads, so it sees everything A wrote.
    const seen = JSON.parse(await b('status', '--json'));
    assert.equal(seen.settings.name, 'Allen');
    assert.deepEqual(seen.stats.map((s) => s.name), ['Body', 'Mind', 'Work']);
    assert.equal(seen.balance, 20);
    assert.equal(seen.sync.configured, true);

    // And B's writes reach A: a purchase priced on the synced balance.
    assert.match(await b('buy', 'coffee'), /−15 pts\. Balance 20 → 5/);
    assert.match(await a('sync'), /pulled 1, pushed 0/);
    assert.equal(JSON.parse(await a('status', '--json', '--offline')).balance, 5);

    // Each device stamped its own writes.
    const records = JSON.parse(await a('export')).records;
    const origins = new Set(records.map((r) => r.origin));
    assert.equal(origins.size, 2);
  } finally {
    server.kill('SIGTERM');
    await new Promise((ok) => (server.exitCode !== null ? ok() : server.once('exit', ok)));
    for (const h of homes) rmSync(h, { recursive: true, force: true });
  }
});
