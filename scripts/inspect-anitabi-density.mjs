#!/usr/bin/env node

const entryUrl = process.argv[2] ?? 'https://anitabi.cn/map';
const searchArgument = process.argv.find((argument) => argument.startsWith('--search='));
const searchTerm = searchArgument?.slice('--search='.length);
const contextArgument = process.argv.find((argument) => argument.startsWith('--context='));
const requestedContextLength = Number(contextArgument?.slice('--context='.length));
const MAX_BUNDLES = 80;
const contextLength = Number.isFinite(requestedContextLength) ? requestedContextLength : 180;

function normalizeUrl(specifier, baseUrl) {
  try {
    const url = new URL(specifier, baseUrl);
    return url.origin === new URL(entryUrl).origin ? url.href : null;
  } catch {
    return null;
  }
}

function extractScriptUrls(html, baseUrl) {
  const urls = new Set();
  const pattern = /\b(?:src|href)=(?:(["'])([^"']+)\1|([^\s>]+))/gi;
  for (const match of html.matchAll(pattern)) {
    const specifier = match[2] ?? match[3];
    if (!/\.js(?:\?|$)/i.test(specifier)) continue;
    const url = normalizeUrl(specifier, baseUrl);
    if (url) urls.add(url);
  }
  return urls;
}

function extractImportedUrls(source, baseUrl) {
  const urls = new Set();
  const patterns = [
    /\bfrom\s*(["'])([^"']+?\.js(?:\?[^"']*)?)\1/g,
    /\bimport\s*\(\s*(["'])([^"']+?\.js(?:\?[^"']*)?)\1\s*\)/g,
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const url = normalizeUrl(match[2], baseUrl);
      if (url) urls.add(url);
    }
  }
  return urls;
}

function lineNumberAt(source, position) {
  let line = 1;
  for (let index = 0; index < position; index += 1) {
    if (source[index] === '\n') line += 1;
  }
  return line;
}

function snippetsFor(source, pattern) {
  const snippets = [];
  for (const match of source.matchAll(pattern)) {
    const start = Math.max(0, match.index - contextLength);
    const end = Math.min(source.length, match.index + match[0].length + contextLength);
    snippets.push({
      line: lineNumberAt(source, match.index),
      text: source.slice(start, end).replace(/\s+/g, ' '),
    });
  }
  return snippets;
}

function escapeRegExp(value) {
  return value.replace(/[-/\\^*+?.()|[\]{}$]/g, '\\$&');
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(response.status + ' ' + response.statusText);
  return response.text();
}

const page = await fetchText(entryUrl);
const entrypoints = extractScriptUrls(page, entryUrl);
const queue = [...entrypoints];
const visited = new Set();
const bundles = [];

while (queue.length > 0 && bundles.length < MAX_BUNDLES) {
  const url = queue.shift();
  if (!url || visited.has(url)) continue;
  visited.add(url);

  try {
    const source = await fetchText(url);
    bundles.push({ url, source });
    for (const importedUrl of extractImportedUrls(source, url)) {
      if (!visited.has(importedUrl)) queue.push(importedUrl);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn('Skipped ' + url + ': ' + message);
  }
}

const densityPattern = /\bdensity\b/g;
const densityAssignments = /\bdensity\s*:\s*[^,}\n]+/g;
const densityReads = /\.density\b/g;
const dataEndpoints = /\/d\/g(?:[0-5])?\.json\?d=/g;
const searchPattern = searchTerm ? new RegExp(escapeRegExp(searchTerm), 'g') : null;

console.log('Entry: ' + entryUrl);
console.log('HTML bytes: ' + page.length);
console.log('JavaScript entrypoints: ' + entrypoints.size);
console.log('Bundles analysed: ' + bundles.length);

let densityTokens = 0;
let assignmentCount = 0;
let readCount = 0;
let endpointCount = 0;

for (const bundle of bundles) {
  const tokenCount = [...bundle.source.matchAll(densityPattern)].length;
  const assignments = snippetsFor(bundle.source, densityAssignments);
  const reads = snippetsFor(bundle.source, densityReads);
  const endpoints = snippetsFor(bundle.source, dataEndpoints);
  const searchResults = searchPattern ? snippetsFor(bundle.source, searchPattern) : [];

  densityTokens += tokenCount;
  assignmentCount += assignments.length;
  readCount += reads.length;
  endpointCount += endpoints.length;

  if (tokenCount === 0 && endpoints.length === 0 && searchResults.length === 0) continue;

  console.log('\n' + bundle.url);
  console.log('  density tokens: ' + tokenCount + ', assignments: ' + assignments.length + ', reads: ' + reads.length);

  const results = searchPattern ? searchResults : [...assignments, ...reads, ...endpoints];
  for (const item of results.slice(0, 12)) {
    console.log('  line ' + item.line + ': ' + item.text);
  }
}

console.log('\nSummary');
console.log('  density tokens: ' + densityTokens);
console.log('  density assignments: ' + assignmentCount);
console.log('  density property reads: ' + readCount);
console.log('  g*.json endpoints: ' + endpointCount);
if (searchTerm) console.log('  search term: ' + searchTerm);
console.log(
  assignmentCount > 0 && readCount === 0
    ? '  Interpretation: the inspected bundles assign density while decoding data, but do not use it later.'
    : '  Interpretation: inspect the snippets above to determine whether density is computed or only decoded.',
);
