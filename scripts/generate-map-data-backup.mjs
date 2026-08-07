#!/usr/bin/env node

import { Buffer } from 'node:buffer';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_BASE_URL = 'https://www.anitabi.cn';
const REQUIRED_DETAIL_SHARDS = 6;
const MAX_DETAIL_SHARDS = 100;
const REQUEST_TIMEOUT_MS = 30_000;
const REQUEST_ATTEMPTS = 4;

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(scriptDirectory, '..');
const outputPath = path.join(projectDirectory, 'assets', 'data', 'bangumis-map-data.json');
const temporaryOutputPath = outputPath + '.tmp';
const baseUrl = (process.env.ANITABI_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
const cacheKey = (Math.floor(Date.now() / 1e3 / 60 / 24) + 6).toString(36);

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

class HttpError extends Error {
  constructor(url, status, statusText) {
    super(`HTTP ${status} ${statusText} (${url})`);
    this.name = 'HttpError';
    this.status = status;
  }
}

async function fetchJson(pathname) {
  const url = `${baseUrl}${pathname}?d=${cacheKey}`;
  let lastError;

  for (let attempt = 1; attempt <= REQUEST_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        headers: {
          accept: 'application/json',
          'user-agent': 'anitabi-app-map-backup/1.0',
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new HttpError(url, response.status, response.statusText);
      }

      return await response.json();
    } catch (error) {
      lastError = error;
      const isNotFound = error instanceof HttpError && error.status === 404;
      const isRetryableHttpError =
        error instanceof HttpError && (error.status === 408 || error.status === 429 || error.status >= 500);

      if (isNotFound || (error instanceof HttpError && !isRetryableHttpError) || attempt === REQUEST_ATTEMPTS) {
        throw error;
      }

      await sleep(500 * 2 ** (attempt - 1));
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError;
}

function assertArray(value, label) {
  if (!Array.isArray(value)) {
    throw new TypeError(`${label} is not an array`);
  }
  return value;
}

async function fetchDetailShards() {
  const requiredShards = await Promise.all(
    Array.from({ length: REQUIRED_DETAIL_SHARDS }, async (_, index) => {
      const shard = assertArray(await fetchJson(`/d/g${index}.json`), `g${index}.json`);
      console.log(`Downloaded g${index}.json (${shard.length} records)`);
      return shard;
    }),
  );

  const shards = [...requiredShards];
  for (let index = REQUIRED_DETAIL_SHARDS; index < MAX_DETAIL_SHARDS; index += 1) {
    try {
      const shard = assertArray(await fetchJson(`/d/g${index}.json`), `g${index}.json`);
      console.log(`Downloaded g${index}.json (${shard.length} records)`);
      shards.push(shard);
    } catch (error) {
      if (error instanceof HttpError && error.status === 404) return shards;
      throw error;
    }
  }

  throw new Error(
    `More than ${MAX_DETAIL_SHARDS} detail shards found; refusing to write a potentially incomplete backup`,
  );
}

function toTheme(input) {
  if (!Array.isArray(input)) return { src: '', ids: [], modified: 0, w: 0, h: 0 };
  const [src, ids, modified, w, h] = input;
  return {
    src: src ?? '',
    ids: Array.isArray(ids) ? ids : [],
    modified: typeof modified === 'number' ? modified : 0,
    w: typeof w === 'number' ? w : 0,
    h: typeof h === 'number' ? h : 0,
  };
}

function toPoint(input) {
  if (!Array.isArray(input)) return { id: '', cn: '', isFolder: false };
  const [id, name, cn, isFolder, mid, uid, image, fid, ep, s, mark, origin, originLink, folder, density] = input;
  return {
    id,
    name: name || undefined,
    cn: typeof cn === 'number' ? '' : String(cn ?? ''),
    isFolder: isFolder !== 0,
    mid: mid ? String(mid) : undefined,
    uid: uid || undefined,
    image: image || undefined,
    fid: fid ? String(fid) : undefined,
    ep: ep ?? undefined,
    s: s ? Number(s) : undefined,
    mark: mark || undefined,
    origin: origin ? String(origin) : undefined,
    originLink: originLink ? String(originLink) : undefined,
    folder: folder || undefined,
    density: density || undefined,
  };
}

function assembleBangumis(gList, detailShards) {
  const detailMap = new Map();

  for (const shard of detailShards) {
    for (const detail of shard) {
      if (!Array.isArray(detail) || !Number.isInteger(detail[0])) {
        throw new TypeError('A detail shard contains an invalid record');
      }
      if (detailMap.has(detail[0])) {
        throw new Error(`Duplicate detail record for bangumi ${detail[0]}`);
      }
      detailMap.set(detail[0], detail);
    }
  }

  const missingDetailIds = gList.filter((item) => !detailMap.has(item?.[0])).map((item) => item?.[0]);
  if (missingDetailIds.length > 0) {
    const preview = missingDetailIds.slice(0, 10).join(', ');
    throw new Error(`Missing detail data for ${missingDetailIds.length} bangumis: ${preview}`);
  }

  let maxModified = 0;
  let pointCount = 0;
  const bangumis = gList.map((item) => {
    if (!Array.isArray(item) || !Number.isInteger(item[0])) {
      throw new TypeError('g.json contains an invalid bangumi record');
    }

    const [id, cn, en, title, city, color, cover, fade, cat, lat, lng, zoom, pointMeta, abbr, tags, priority, icon] =
      item;
    const detail = detailMap.get(id);
    const pointLookup = new Map();

    if (Array.isArray(pointMeta)) {
      if (pointMeta.length % 4 !== 0) {
        throw new Error(`Invalid point metadata for bangumi ${id}`);
      }
      for (let index = 0; index < pointMeta.length; index += 4) {
        pointLookup.set(pointMeta[index], {
          geo: [pointMeta[index + 1], pointMeta[index + 2]],
          priority: pointMeta[index + 3],
        });
      }
    }

    const rawPoints = detail && Array.isArray(detail[2]) ? detail[2] : [];
    const rawPointIds = new Set(rawPoints.map((rawPoint) => rawPoint?.[0]));
    const missingPointIds = [...pointLookup.keys()].filter((pointId) => !rawPointIds.has(pointId));
    if (missingPointIds.length > 0) {
      throw new Error(`Missing ${missingPointIds.length} point details for bangumi ${id}`);
    }

    const points = rawPoints.map((rawPoint) => {
      if (!Array.isArray(rawPoint) || typeof rawPoint[0] !== 'string') {
        throw new TypeError(`Invalid point detail for bangumi ${id}`);
      }
      const point = toPoint(rawPoint);
      const metadata = pointLookup.get(point.id);
      return {
        ...point,
        geo: metadata?.geo ?? [0, 0],
        priority: metadata?.priority ?? 0,
      };
    });

    pointCount += points.length;
    const modified = typeof detail?.[3] === 'number' ? detail[3] : 0;
    if (modified > maxModified) maxModified = modified;

    return {
      id,
      cn: cn || '',
      en: typeof en === 'number' ? '' : en || '',
      title: title || '',
      city: city || '',
      color: color || '',
      cover: cover || '',
      fade: fade ?? 0,
      cat: cat || '',
      geo: [lat, lng],
      zoom: zoom ?? 0,
      modified,
      points,
      theme: toTheme(detail?.[1]),
      abbr: abbr ? String(abbr) : '',
      tags: Array.isArray(tags) ? tags : [],
      priority: priority ?? 999,
      icon: icon || '',
    };
  });

  bangumis.sort((left, right) => right.modified - left.modified);
  return { assembledData: { data: { bangumis, modified: maxModified } }, pointCount };
}

async function main() {
  console.log(`Downloading map data from ${baseUrl}`);
  const [gRaw, detailShards] = await Promise.all([fetchJson('/d/g.json'), fetchDetailShards()]);
  assertArray(gRaw, 'g.json');
  const gList = assertArray(gRaw[0], 'g.json bangumi list');
  const { assembledData, pointCount } = assembleBangumis(gList, detailShards);
  const compactJson = JSON.stringify(assembledData);

  await mkdir(path.dirname(outputPath), { recursive: true });
  await rm(temporaryOutputPath, { force: true });

  try {
    await writeFile(temporaryOutputPath, compactJson, 'utf8');
    await rename(temporaryOutputPath, outputPath);
  } finally {
    await rm(temporaryOutputPath, { force: true });
  }

  const sizeInMiB = (Buffer.byteLength(compactJson) / 1024 / 1024).toFixed(2);
  console.log(
    `Saved ${assembledData.data.bangumis.length} bangumis and ${pointCount} points to ${outputPath} (${sizeInMiB} MiB)`,
  );
}

main().catch((error) => {
  console.error(`Map data backup failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
