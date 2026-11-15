import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import semver from 'semver';

function checkOptions(options) {
  if (options.npmPublish !== false || options.pkgRoot !== undefined || options.tarballDir !== undefined) {
    throw new Error('This local release plugin only supports npmPublish:false without pkgRoot or tarballDir');
  }
}

export function verifyConditions(options) {
  checkOptions(options);
}

// The gem preparation step reads this version after semantic-release prepares it.
// No npm publication, registry access, tarball creation, or lifecycle scripts run here.
export async function prepare(options, { cwd, nextRelease, logger }) {
  checkOptions(options);
  if (!semver.valid(nextRelease?.version)) throw new Error('A valid next release version is required');
  const files = [];
  for (const name of ['package.json', 'package-lock.json', 'npm-shrinkwrap.json']) {
    const path = join(cwd, name);
    let text;
    try {
      text = await readFile(path, 'utf8');
    } catch (error) {
      if (name !== 'package.json' && error.code === 'ENOENT') continue;
      throw error;
    }
    const data = JSON.parse(text);
    if (name === 'package.json' && ['preversion', 'version', 'postversion'].some((hook) => data.scripts?.[hook])) {
      throw new Error('Version lifecycle hooks require a full npm release plugin');
    }
    data.version = nextRelease.version;
    if (name !== 'package.json' && data.packages?.['']) data.packages[''].version = nextRelease.version;
    const indentation = text.match(/\n([\t ]+)"/)?.[1] ?? '  ';
    files.push({ path, text: JSON.stringify(data, null, indentation) + '\n' });
  }
  for (const file of files) await writeFile(file.path, file.text);
  logger?.log('Prepared package version %s without npm publishing', nextRelease.version);
}

export function publish(options) {
  checkOptions(options);
}

export function addChannel(options) {
  checkOptions(options);
}
