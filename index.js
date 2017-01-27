const urlParse = require('url').parse;
const micro = require('micro');
const LRU = require('lru-cache');
const fetch = require('node-fetch');
const hostedGitInfo = require('hosted-git-info');
const pkg = require('./package.json');

const cache = LRU(50);

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

function getRouteParam(reqUrl) {
  const route = reqUrl.replace('/', '');
  const blacklist = ['favicon.ico', 'robots.txt'];

  if (blacklist.includes(route)) {
    return null;
  }

  return route;
}

function getPackageName(route) {
  const prefix = 'r/';
  if (!route || !route.startsWith(prefix)) {
    return null;
  }
  return route.split(prefix)[1];
}

async function getPackage(name) {
  const registryUrl = `https://registry.npmjs.org/${name}/latest`;
  const response = await fetch(registryUrl);
  return response.json();
}

async function getPackageRepoUrl(name) {
  const cachedRepoUrl = cache.get(name);

  if (cachedRepoUrl) {
    return cachedRepoUrl;
  }

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

function getPackageRedirectUrl(name) {
  return `${pkg.homepage}/r/${name}`;
}

function renderOpenSearch(req, res) {
  const url = getPackageRedirectUrl('{searchTerms}');
  const contents = `
  <OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/"
    xmlns:moz="http://www.mozilla.org/2006/browser/search/">
    <ShortName>npm-repo</ShortName>
    <Description>Package Repo Redirect</Description>
    <Url type="text/html" method="get" template="${url}"/>
    <InputEncoding>UTF-8</InputEncoding>
  </OpenSearchDescription>`;
  res.setHeader('Content-Type', 'text/xml; charset=utf-8');
  return micro.send(res, 200, contents);
}

function renderHome(req, res) {
  const exampleUrl = getPackageRedirectUrl(pickRandom(POPULAR));
  const cachedEntries = cache.keys().slice(0, 5)
    .map((k) => ({ name: k, url: getPackageRedirectUrl(k) }));

  const OPEN_SEARCH = (
    '<link rel="search" type="application/opensearchdescription+xml" ' +
    'href="/opensearch.xml" title="npm-repo">'
  );

  const RECENT_ENTRIES = (cachedEntries.length > 0) ?
      `<p>Recent:
        ${cachedEntries.map((r) => (
          `<a href="${r.url}">${r.name}</a>`
        )).join(' | ')}
      </p>` : '';

  const GIF_URL = (
    'https://cloud.githubusercontent.com/assets/' +
    '83319/22361889/223deeb8-e42c-11e6-896a-1cb5bdb38b20.gif'
  );

  const README = (
    '<!doctype html><meta charset="utf-8">' +
    `<title>${pkg.description}</title>` +
    OPEN_SEARCH +
    `<strong>🚀 ${pkg.description}</strong>` +
    `<p>Example: <a href="${exampleUrl}">${exampleUrl}</a></p>` +
     RECENT_ENTRIES +
     `<p><img src="${GIF_URL}" width="300"></p>` +
    `<p>Made with ❤️ by <a href="${pkg.author.url}">${pkg.author.name}</a>` +
    `<br>Source: <a href="${pkg.repository}">${pkg.repository}</a></p>`
  );

  return micro.send(res, 200, README);
}

module.exports = async function(req, res) {
  let repositoryUrl;
  const route = getRouteParam(req.url);
  let pkgName = getPackageName(route);

  if (route === 'opensearch.xml') {
    return renderOpenSearch(req, res);
  } else if (!pkgName) {
    pkgName = route;
  }

  if (!pkgName) {
    return renderHome(req, res);
  }

  try {
    repositoryUrl = await getPackageRepoUrl(pkgName);
    cache.set(pkgName, repositoryUrl);
  } catch (err) {
    repositoryUrl = `https://www.npmjs.com/package/${pkgName}`;
  }

  res.setHeader('Location', repositoryUrl);
  return micro.send(res, 302);
};
