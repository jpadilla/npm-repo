const urlParse = require('url').parse;
const micro = require('micro');
const fetch = require('node-fetch');
const hostedGitInfo = require('hosted-git-info');
const pkg = require('./package.json');

const POPULAR = ['lodash', 'request', 'express', 'npm', 'debug'];

function pickRandom(arr) {
  return arr[Math.floor(Math.random(arr) * arr.length)];
}

function unknownHostedUrl(reporUrl) {
  // From https://github.com/npm/npm/blob/master/lib/repo.js
  let url = null;

  try {
    const idx = reporUrl.indexOf('@');
    if (idx !== -1) {
      url = reporUrl.slice(idx + 1).replace(/:([^\d]+)/, '/$1');
    }
    url = urlParse(url);
    const protocol = url.protocol === 'https:' ? 'https:' : 'http:';
    url = protocol + '//' + (url.host || '') + url.path.replace(/\.git$/, '');
  } catch (e) { /* empty */ }

  return url;
}

function getPackageName(reqUrl) {
  const name = reqUrl.split('/')[1];

  if (name === 'favicon.ico') {
    return null;
  }

  return name;
}

async function getPackage(name) {
  const registryUrl = `https://registry.npmjs.org/${name}/latest`;
  const response = await fetch(registryUrl);
  return response.json();
}

async function getPackageRepoUrl(name) {
  const response = await getPackage(name);
  const repository = response.repository || {};
  const repoUrl = repository.url;

  if (!repoUrl) {
    throw new Error('No repository URL found.');
  }

  const info = hostedGitInfo.fromUrl(repoUrl);
  const browseUrl = info ? info.browse() : unknownHostedUrl(repoUrl);

  if (!browseUrl) {
    throw new Error('Could not get repository url');
  }

  return browseUrl;
}

module.exports = async function(req, res) {
  let repositoryUrl;
  const pkgName = getPackageName(req.url);

  if (!pkgName) {
    const EXAMPLE_URL = `${pkg.homepage}/${pickRandom(POPULAR)}`;
    const README = (
      '<!doctype html><meta charset="utf-8">' +
      `<title>${pkg.description}</title>` +
      `<strong>🚀 ${pkg.description}</strong>` +
      `<p>Example: <a href="${EXAMPLE_URL}">${EXAMPLE_URL}</a></p>` +
      '<p>Made with ❤️ by <a href="http://jpadilla.com">Jose Padilla</a><br>' +
      `Source: <a href="${pkg.repository}">${pkg.repository}</a></p>`
    );

    return micro.send(res, 200, README);
  }

  try {
    repositoryUrl = await getPackageRepoUrl(pkgName);
  } catch (err) {
    repositoryUrl = `https://www.npmjs.com/package/${pkgName}`;
  }

  res.setHeader('Location', repositoryUrl);
  return micro.send(res, 302);
};
