import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { addChannel, prepare, publish, verifyConditions } from './index.js';

test('prepares a consistent gem input version and preserves other manifest fields', async (t) => {
  const cwd = await mkdtemp(join(process.cwd(), '.tmp-release-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  await writeFile(join(cwd, 'package.json'), JSON.stringify({ name: 'fixture', version: '1.0.0', private: true }));
  for (const name of ['package-lock.json', 'npm-shrinkwrap.json']) {
    await writeFile(join(cwd, name), JSON.stringify({ version: '1.0.0', lockfileVersion: 3, packages: { '': { version: '1.0.0', name: 'fixture' }, 'node_modules/fixture': { version: '9.0.0' } } }));
  }
  const options = { npmPublish: false };
  verifyConditions(options);
  for (let attempt = 0; attempt < 2; attempt++) await prepare(options, { cwd, nextRelease: { version: '2.0.0-beta.1' } });
  assert.deepEqual(JSON.parse(await readFile(join(cwd, 'package.json'))), { name: 'fixture', version: '2.0.0-beta.1', private: true });
  for (const name of ['package-lock.json', 'npm-shrinkwrap.json']) {
    const lock = JSON.parse(await readFile(join(cwd, name)));
    assert.equal(lock.version, '2.0.0-beta.1');
    assert.equal(lock.packages[''].version, '2.0.0-beta.1');
    assert.equal(lock.packages['node_modules/fixture'].version, '9.0.0');
  }
  assert.equal(publish(options), undefined);
  assert.equal(addChannel(options), undefined);
});

test('rejects unsupported publication, alternate roots and tarballs', async () => {
  for (const options of [{}, { npmPublish: true }, { npmPublish: false, pkgRoot: 'dist' }, { npmPublish: false, tarballDir: 'dist' }]) {
    assert.throws(() => verifyConditions(options), /only supports/);
    await assert.rejects(prepare(options, {}), /only supports/);
    assert.throws(() => publish(options), /only supports/);
    assert.throws(() => addChannel(options), /only supports/);
  }
  await assert.rejects(prepare({ npmPublish: false }, { cwd: '.', nextRelease: { version: 'invalid' } }), /valid next release/);
});

test('loads the installed replacement before the gem preparation plugin', async () => {
  const installed = await import('@semantic-release/npm');
  installed.verifyConditions({ npmPublish: false });
  assert.throws(() => installed.verifyConditions({ npmPublish: true }), /only supports/);
  const { release } = JSON.parse(await readFile(new URL('../../package.json', import.meta.url)));
  const names = release.plugins.map((plugin) => Array.isArray(plugin) ? plugin[0] : plugin);
  assert(names.indexOf('@semantic-release/npm') < names.indexOf('@semantic-release/exec'));
});

test('refuses version lifecycle hooks before changing a manifest', async (t) => {
  const cwd = await mkdtemp(join(process.cwd(), '.tmp-release-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const content = JSON.stringify({ version: '1.0.0', scripts: { version: 'unexpected-command' } });
  await writeFile(join(cwd, 'package.json'), content);
  await assert.rejects(prepare({ npmPublish: false }, { cwd, nextRelease: { version: '2.0.0' } }), /lifecycle hooks/);
  assert.equal(await readFile(join(cwd, 'package.json'), 'utf8'), content);
});
