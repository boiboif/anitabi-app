import { readFile, rm, writeFile } from 'node:fs/promises';

const output = new URL('../docs/.vitepress/dist/website-stats.json', import.meta.url);
const websiteId = process.env.DOCS_UMAMI_WEBSITE_ID?.trim();
const apiKey = process.env.DOCS_UMAMI_API_KEY?.trim();
const checkpointPath = process.env.DOCS_STATS_CHECKPOINT;
const checkpointOutput = process.env.DOCS_STATS_CHECKPOINT_OUTPUT;
const checkpointState = process.env.DOCS_STATS_CHECKPOINT_STATE;
const bootstrap = process.env.DOCS_STATS_BOOTSTRAP === 'true';
const windowMs = 30 * 24 * 60 * 60 * 1000;
const maxCheckpointAgeMs = 60 * 24 * 60 * 60 * 1000;
const validCount = (value) => Number.isSafeInteger(value) && value >= 0;

await rm(output, { force: true });
if (checkpointOutput) await rm(checkpointOutput, { force: true });

if (!websiteId || !apiKey) {
  console.log('Website statistics are not configured; skipping public data.');
} else {
  try {
    const endAt = Date.now();
    const apiRoot = `https://api.umami.is/v1/websites/${encodeURIComponent(websiteId)}`;
    const getJson = async (url) => {
      const response = await fetch(url, {
        headers: { Accept: 'application/json', Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error(`Umami returned HTTP ${response.status}`);
      return response.json();
    };
    const getStats = (startAt) => {
      const url = new URL(`${apiRoot}/stats`);
      url.searchParams.set('startAt', String(startAt));
      url.searchParams.set('endAt', String(endAt));
      return getJson(url);
    };
    const current = await getStats(endAt - windowMs);
    if (!validCount(current?.pageviews) || !validCount(current?.visitors)) throw new Error('Invalid 30-day statistics');
    const snapshot = { period: '30d', pageviews: current.pageviews, visitors: current.visitors, updatedAt: new Date(endAt).toISOString() };

    try {
      let totalPageviews;
      let totalSince;
      if (checkpointState === 'ready' && checkpointPath) {
        const previous = JSON.parse(await readFile(checkpointPath, 'utf8'));
        const previousAt = typeof previous.updatedAt === 'string' ? Date.parse(previous.updatedAt) : NaN;
        const previousSince = typeof previous.totalSince === 'string' ? Date.parse(previous.totalSince) : NaN;
        if (previous.format !== 1 || previous.websiteId !== websiteId || previous.period !== '30d' ||
            !validCount(previous.pageviews) || !validCount(previous.totalPageviews) || previous.totalPageviews < previous.pageviews ||
            !Number.isFinite(previousAt) || !Number.isFinite(previousSince) || previousSince < 0 ||
            previousSince > previousAt || previousAt > endAt || endAt - previousAt > maxCheckpointAgeMs) {
          throw new Error('Invalid or expired checkpoint');
        }
        // Replace the last 30-day window with a fresh overlapping query, so
        // boundary events are not double-counted and recent late arrivals count.
        const overlap = await getStats(previousAt - windowMs);
        if (!validCount(overlap?.pageviews)) throw new Error('Invalid overlapping statistics');
        totalPageviews = previous.totalPageviews - previous.pageviews + overlap.pageviews;
        if (!validCount(totalPageviews) || totalPageviews < current.pageviews) throw new Error('Invalid cumulative statistics');
        totalSince = previous.totalSince;
      } else if (checkpointState === 'missing' && bootstrap) {
        const range = await getJson(new URL(`${apiRoot}/daterange`));
        const earliest = typeof range?.startDate === 'string' ? Date.parse(range.startDate) : NaN;
        if (!Number.isFinite(earliest) || earliest < 0 || earliest > endAt) throw new Error('Invalid date range');
        const total = await getStats(Math.max(0, earliest - 1));
        if (!validCount(total?.pageviews) || total.pageviews < current.pageviews) throw new Error('Invalid cumulative statistics');
        totalPageviews = total.pageviews;
        totalSince = new Date(earliest).toISOString();
      } else {
        throw new Error('Checkpoint unavailable or not initialized');
      }
      if (!checkpointOutput) throw new Error('Checkpoint destination unavailable');
      const checkpoint = { format: 1, websiteId, ...snapshot, totalPageviews, totalSince };
      await writeFile(checkpointOutput, JSON.stringify(checkpoint) + '\n');
      snapshot.totalPageviews = totalPageviews;
      snapshot.totalSince = totalSince;
    } catch {
      console.warn('Unable to update the cumulative total; publishing 30-day statistics only.');
    }
    await writeFile(output, JSON.stringify(snapshot) + '\n');
    console.log('Public website statistics generated.');
  } catch {
    console.warn('Unable to generate public website statistics; the site will omit them.');
  }
}
