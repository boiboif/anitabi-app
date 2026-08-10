#!/usr/bin/env node

/**
 * 下载所有巡礼点截图、番剧封面、雪碧图。
 *
 * 图片来源：
 *   1. 番剧封面 (cover)   — g.json 中的 cover 字段
 *   2. 番剧图标 (icon)    — g.json 中 icon 字段（仅当是图片路径时）
 *   3. 巡礼点截图          — 各个 detail shard 中 point.image
 *   4. 主题图 (theme)     — detail shard 中 theme.src
 *   5. 雪碧图             — /d/bangumi-icons.json 的 src
 *
 * 注意：icon 字段多数是番剧昵称（如「けいおん」），不是图片路径。
 *       前端用法是 b.icon || b.cover，icon 是展示文本，cover 才是图片。
 *
 * 限制：每批 20 张，批次间隔 1 秒。
 * 幂等：已存在的文件跳过不重复下载。
 * 失败记录：完成后写入 downloads/images/failed-urls.json。
 *
 * 输出目录：downloads/images/
 *   covers/    番剧封面
 *   points/    巡礼点截图
 *   themes/    主题图
 *   sprites/   雪碧图
 */

import { Buffer } from 'node:buffer';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ===========================================================================
// 配置
// ===========================================================================

const DEFAULT_BASE_URL = 'https://www.anitabi.cn';
const IMAGE_CDN = 'https://img-tc.anitabi.cn';
const BATCH_SIZE = 15;
const REQUEST_TIMEOUT_MS = 60_000;
const REQUEST_ATTEMPTS = 4;

// ===========================================================================
// 路径 & 环境
// ===========================================================================

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(scriptDirectory, '..');
const baseUrl = (process.env.ANITABI_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
const outputRoot = path.join(projectDirectory, 'downloads', 'images');
const failedLogPath = path.join(outputRoot, 'failed-urls.json');
const manifestPath = path.join(outputRoot, '.manifest.json');
const cacheKey = (Math.floor(Date.now() / 1e3 / 60 / 24) + 6).toString(36);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ===========================================================================
// Manifest（替代 readdir，避免 Windows 下大目录扫描缓慢）
// ===========================================================================

/**
 * 加载本地已有文件清单。
 * 优先读 .manifest.json；若不存在则扫描磁盘目录初始化（仅首次）。
 * 返回 Set<"category/filename">。
 */
async function loadManifest(categories) {
  try {
    const raw = await readFile(manifestPath, 'utf8');
    return new Set(JSON.parse(raw));
  } catch {
    // 首次运行：扫描磁盘目录构建初始 manifest
    console.log('No manifest found, scanning existing files on disk...');
    const entries = [];
    await Promise.all(
      categories.map(async ({ name }) => {
        const dir = path.join(outputRoot, name);
        try {
          const files = await readdir(dir);
          for (const f of files) entries.push(name + '/' + f);
        } catch {
          // 目录不存在则跳过
        }
      }),
    );
    // 也扫描 sprites 目录
    try {
      const spriteDir = path.join(outputRoot, 'sprites');
      const spriteFiles = await readdir(spriteDir);
      for (const f of spriteFiles) entries.push('sprites/' + f);
    } catch {}
    const set = new Set(entries);
    await saveManifest(set);
    console.log(`  Scanned ${set.size} existing files, manifest saved.`);
    return set;
  }
}

/** 将 manifest Set 写回磁盘。 */
async function saveManifest(manifestSet) {
  await writeFile(manifestPath, JSON.stringify([...manifestSet]), 'utf8');
}

// ===========================================================================
// HTTP 工具
// ===========================================================================

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
          'user-agent': 'anitabi-app-image-downloader/1.0',
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

// ===========================================================================
// 数据拉取
// ===========================================================================

async function fetchDetailShards() {
  const REQUIRED_DETAIL_SHARDS = 6;
  const MAX_DETAIL_SHARDS = 100;

  const requiredShards = await Promise.all(
    Array.from({ length: REQUIRED_DETAIL_SHARDS }, async (_, index) => {
      const shard = await fetchJson(`/d/g${index}.json`);
      console.log(`Downloaded g${index}.json (${shard.length} records)`);
      return shard;
    }),
  );

  const shards = [...requiredShards];
  for (let index = REQUIRED_DETAIL_SHARDS; index < MAX_DETAIL_SHARDS; index += 1) {
    try {
      const shard = await fetchJson(`/d/g${index}.json`);
      console.log(`Downloaded g${index}.json (${shard.length} records)`);
      shards.push(shard);
    } catch (error) {
      if (error instanceof HttpError && error.status === 404) return shards;
      if (error instanceof SyntaxError) {
        console.warn(`g${index}.json returned non-JSON response; assuming end of shards`);
        return shards;
      }
      throw error;
    }
  }

  throw new Error(
    `More than ${MAX_DETAIL_SHARDS} detail shards found; refusing to parse potentially incomplete data`,
  );
}

// ===========================================================================
// 图片 URL 提取
// ===========================================================================

/** 判断 rawPath 是否是合法的图片路径（以 / 或 http 开头） */
function isImagePath(rawPath) {
  if (!rawPath || typeof rawPath !== 'string') return false;
  return rawPath.startsWith('/') || rawPath.startsWith('http://') || rawPath.startsWith('https://');
}

/**
 * 将服务器返回的图片路径转为 CDN URL。
 * 逻辑与 buildImageUrl 一致：相对路径拼到 imageUrl 上，去掉 /images 前缀。
 */
function toCdnUrl(rawPath) {
  if (rawPath.startsWith('http://') || rawPath.startsWith('https://')) {
    return rawPath.replace('http://', 'https://');
  }
  return `${IMAGE_CDN}${rawPath}`.replace('/images', '');
}

/** 从 URL 提取文件名（去掉查询参数） */
function filenameFromUrl(url) {
  const withoutQuery = url.split('?')[0];
  const segments = withoutQuery.split('/');
  return segments[segments.length - 1];
}

/**
 * 从原始数据中提取所有需要下载的图片 URL。
 * icon 字段中大量值是番剧昵称（非路径），前端用法是 b.icon || b.cover，
 * icon 作为展示文本，cover 才是图片。因此 icon 只在是合法路径时才加入。
 */
function extractImages(gList, detailShards) {
  const covers = new Set();
  const points = new Set();
  const themes = new Set();

  let skippedIcons = 0;

  for (const item of gList) {
    const cover = item?.[6];
    if (cover && isImagePath(String(cover))) {
      covers.add(toCdnUrl(String(cover)));
    }

    const icon = item?.[17];
    if (icon && icon !== cover) {
      if (isImagePath(String(icon))) {
        covers.add(toCdnUrl(String(icon)));
      } else {
        skippedIcons += 1;
      }
    }
  }

  if (skippedIcons > 0) {
    console.log(`  (skipped ${skippedIcons} non-path icon values — these are display nicknames, not images)`);
  }

  for (const shard of detailShards) {
    for (const detail of shard) {
      const theme = detail?.[1];
      if (Array.isArray(theme) && theme[0] && isImagePath(String(theme[0]))) {
        themes.add(toCdnUrl(String(theme[0])));
      }

      const rawPoints = detail?.[2];
      if (!Array.isArray(rawPoints)) continue;
      for (const rawPoint of rawPoints) {
        const image = rawPoint?.[6];
        if (image && isImagePath(String(image))) {
          points.add(toCdnUrl(String(image)));
        }
      }
    }
  }

  return { covers, points, themes };
}

// ===========================================================================
// 图片下载
// ===========================================================================

/**
 * 下载单张图片到指定文件。
 * 已存在的文件跳过不下载（幂等）。
 * 返回 { url, path, size } 或 { url, error }。
 */
async function downloadOne(url, filePath) {
  for (let attempt = 1; attempt <= REQUEST_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        headers: {
          'user-agent': 'anitabi-app-image-downloader/1.0',
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new HttpError(url, response.status, response.statusText);
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      await writeFile(filePath, buffer);
      return { url, path: filePath, size: buffer.length };
    } catch (error) {
      const isNotFound = error instanceof HttpError && error.status === 404;
      const isRetryable =
        error instanceof HttpError && (error.status === 408 || error.status === 429 || error.status >= 500);

      if (isNotFound || (error instanceof HttpError && !isRetryable) || attempt === REQUEST_ATTEMPTS) {
        return { url, error: error.message };
      }

      await sleep(500 * 2 ** (attempt - 1));
    } finally {
      clearTimeout(timeout);
    }
  }

  return { url, error: 'unknown error' };
}

/**
 * 下载单个分类的所有图片。
 * manifestSet 是全局已下载文件清单（Set<"category/filename">），
 * 用于跳过已有文件，并在下载成功后实时更新。
 * 返回 { success, failed, skipped, failedUrls }。
 */
async function downloadBatch(category, urls, manifestSet) {
  const dir = path.join(outputRoot, category);
  await mkdir(dir, { recursive: true });

  const prefix = category + '/';
  const allUrls = [...urls];
  let skipCount = 0;
  /** @type {string[]} 需要实际下载的 URL */
  const pendingUrls = [];

  for (const url of allUrls) {
    const name = filenameFromUrl(url);
    if (manifestSet.has(prefix + name)) {
      skipCount += 1;
    } else {
      pendingUrls.push(url);
    }
  }

  if (skipCount > 0) {
    console.log(`  [${category}] ${skipCount} files already exist, skipping`);
  }

  if (pendingUrls.length === 0) {
    return { success: 0, skipped: skipCount, failed: 0, failedUrls: [] };
  }

  let success = 0;
  let failed = 0;
  /** @type {{ url: string; error: string }[]} */
  const failedUrls = [];
  let done = 0;
  const total = pendingUrls.length;
  const logEvery = Math.max(Math.floor(total / 50), 1);
  let nextLogAt = logEvery;

  const downloadTracked = async (url) => {
    const name = filenameFromUrl(url);
    const filePath = path.join(dir, name);
    const r = await downloadOne(url, filePath);
    done += 1;

    if (r.error) {
      failed += 1;
      failedUrls.push({ url: r.url, error: r.error });
      console.error(`  FAILED: ${r.url} — ${r.error}`);
    } else {
      success += 1;
      manifestSet.add(prefix + name);
    }

    if (done >= nextLogAt || done === total) {
      console.log(`  [${category}] ${done}/${total} (new: ${success}, fail: ${failed})`);
      nextLogAt = done + logEvery;
    }
  };

  // 滑动并发窗口：CONCURRENCY 个 worker 各从队列取任务，完成即取下一个
  const CONCURRENCY = BATCH_SIZE;
  let cursor = 0;

  async function worker() {
    while (cursor < total) {
      const i = cursor++;
      await downloadTracked(pendingUrls[i]);
    }
  }

  const workers = Array.from({ length: CONCURRENCY }, () => worker());
  await Promise.all(workers);

  return { success, skipped: skipCount, failed, failedUrls };
}

// ===========================================================================
// 雪碧图下载
// ===========================================================================

async function downloadSprite(manifestSet) {
  const dir = path.join(outputRoot, 'sprites');
  await mkdir(dir, { recursive: true });

  console.log('Fetching sprite sheet metadata...');
  let resp;
  try {
    resp = await fetchJson('/d/bangumi-icons.json');
  } catch (error) {
    const entry = { url: `${baseUrl}/d/bangumi-icons.json`, error: error.message };
    console.error('  FAILED to fetch sprite metadata:', error.message);
    return { success: 0, skipped: 0, failed: 1, failedUrls: [entry] };
  }

  const spriteUrl = `${baseUrl}${resp.src}`;
  const name = filenameFromUrl(spriteUrl) || 'sprite.png';
  const filePath = path.join(dir, name);

  // manifest 优先
  if (manifestSet.has('sprites/' + name)) {
    console.log(`  SKIP sprite: ${name} (already in manifest)`);
    return { success: 0, skipped: 1, failed: 0, failedUrls: [] };
  }

  const result = await downloadOne(spriteUrl, filePath);
  if (result.error) {
    const entry = { url: spriteUrl, error: result.error };
    console.error(`  FAILED sprite: ${result.error}`);
    return { success: 0, skipped: 0, failed: 1, failedUrls: [entry] };
  }
  console.log(`  OK sprite: ${name} (${(result.size / 1024).toFixed(1)} KiB)`);
  manifestSet.add('sprites/' + name);
  return { success: 1, skipped: 0, failed: 0, failedUrls: [] };
}

// ===========================================================================
// 失败记录
// ===========================================================================

async function writeFailedLog(allFailedUrls) {
  if (allFailedUrls.length === 0) {
    // 清除上次的失败记录（如果存在）
    try {
      const { rm } = await import('node:fs/promises');
      await rm(failedLogPath, { force: true });
    } catch {}
    return;
  }

  const log = {
    generatedAt: new Date().toISOString(),
    totalFailed: allFailedUrls.length,
    urls: allFailedUrls,
  };
  await writeFile(failedLogPath, JSON.stringify(log, null, 2), 'utf8');
  console.log(`\nFailed URLs written to ${failedLogPath}`);
}

// ===========================================================================
// 主流程
// ===========================================================================

async function main() {
  console.log(`Downloading map data from ${baseUrl} ...`);
  const [gRaw, detailShards] = await Promise.all([fetchJson('/d/g.json'), fetchDetailShards()]);

  if (!Array.isArray(gRaw) || !Array.isArray(gRaw[0])) {
    throw new TypeError('g.json has unexpected structure');
  }
  const gList = gRaw[0];

  console.log(`\nParsed ${gList.length} bangumis and ${detailShards.length} detail shards.`);

  // 提取图片 URL
  const { covers, points, themes } = extractImages(gList, detailShards);
  console.log(
    `\nImage summary:` +
      `\n  covers:  ${covers.size}` +
      `\n  points:  ${points.size}` +
      `\n  themes:  ${themes.size}` +
      `\n  total:   ${covers.size + points.size + themes.size}`,
  );

  // 下载
  let totalSuccess = 0;
  let totalSkipped = 0;
  let totalFailed = 0;
  /** @type {{ url: string; error: string }[]} */
  const allFailedUrls = [];

  const categories = [
    { name: 'covers', urls: covers },
    { name: 'points', urls: points },
    { name: 'themes', urls: themes },
  ];

  // 加载 manifest：首次从磁盘扫描初始化，后续直接读 JSON（<50ms）
  const manifestSet = await loadManifest(categories);
  console.log(`Loaded manifest: ${manifestSet.size} existing files`);

  // 中断时保存 manifest，避免已下载文件丢失
  const saveAndExit = async () => {
    console.log('\nInterrupted, saving manifest...');
    await saveManifest(manifestSet);
    process.exit(0);
  };
  process.on('SIGINT', saveAndExit);

  // 确保目录存在
  await Promise.all(
    categories.map(({ name }) => mkdir(path.join(outputRoot, name), { recursive: true })),
  );

  for (const { name, urls } of categories) {
    if (urls.size === 0) continue;
    console.log(`\n--- Downloading ${name} (${urls.size}) ---`);
    const r = await downloadBatch(name, urls, manifestSet);
    totalSuccess += r.success;
    totalSkipped += r.skipped;
    totalFailed += r.failed;
    allFailedUrls.push(...r.failedUrls);
    await saveManifest(manifestSet);
  }

  console.log(`\n--- Downloading sprite ---`);
  const spriteResult = await downloadSprite(manifestSet);
  totalSuccess += spriteResult.success;
  totalSkipped += spriteResult.skipped;
  totalFailed += spriteResult.failed;
  allFailedUrls.push(...spriteResult.failedUrls);

  await writeFailedLog(allFailedUrls);
  await saveManifest(manifestSet);

  console.log(
    `\n========================================` +
      `\n  Done!` +
      `\n  New:    ${totalSuccess}` +
      `\n  Skip:   ${totalSkipped}` +
      `\n  Failed: ${totalFailed}` +
      `\n  Output: ${outputRoot}` +
      `\n========================================`,
  );
}

main().catch((error) => {
  console.error(`Image download failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});