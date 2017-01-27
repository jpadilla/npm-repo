const urlParse = require('url').parse;
const fetch = require('node-fetch');
const hostedGitInfo = require('hosted-git-info');
const { send, createError } = require('micro');

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

function getRepoUrl(url) {
  const info = hostedGitInfo.fromUrl(url);
  const browseUrl = info ? info.browse() : unknownHostedUrl(url);

  if (!browseUrl) {
    throw new Error('Could not get repository url');
  }

  return browseUrl;
}

function getPackageRepoUrl(pkg) {
  const repository = pkg.repository || {};
  const repoUrl = repository.url;

  if (!repoUrl) {
    throw new Error('No repository URL found.');
  }

  return getRepoUrl(repoUrl);
}

module.exports = async function(req, res) {
  let repositoryUrl;
  const pkgName = getPackageName(req.url);

  if (!pkgName) {
    throw createError(404, 'Invalid package name');
  }

  try {
    const pkg = await getPackage(pkgName);
    repositoryUrl = getPackageRepoUrl(pkg);
  } catch (err) {
    repositoryUrl = `https://www.npmjs.com/package/${pkgName}`;
  }

  res.setHeader('Location', repositoryUrl);
  return send(res, 302);
};
