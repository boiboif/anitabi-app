import { getCachedData, getGModified, setCachedData, setGModified } from '@/lib/map-storage';
import { getG0JSON, getG1JSON, getG2JSON, getG3JSON, getG4JSON, getG5JSON, getGJSON } from '@/services/api';
import type { AssembledData, Bangumi, FetchProgress, Point, RawGBangumi, RawGDetail, Theme } from '@/services/types';

// ---------------------------------------------------------------------------
// Helpers：将原始数组转为业务对象
// ---------------------------------------------------------------------------

const toTheme = (input: unknown): Theme => {
  if (!Array.isArray(input)) {
    return { src: '', ids: [], modified: 0, w: 0, h: 0 };
  }
  const [src, ids, modified, w, h] = input;
  return {
    src: src ?? '',
    ids: Array.isArray(ids) ? ids : [],
    modified: typeof modified === 'number' ? modified : 0,
    w: typeof w === 'number' ? w : 0,
    h: typeof h === 'number' ? h : 0,
  };
};

const toPoint = (input: unknown): Omit<Point, 'geo' | 'priority'> => {
  if (!Array.isArray(input)) {
    return { id: '', cn: '', isFolder: false };
  }
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
};

// ---------------------------------------------------------------------------
// 组装：将 g.json 信息与 g0-g5 的详情合并
// ---------------------------------------------------------------------------

function assembleBangumis(gList: RawGBangumi[], detailMap: Map<number, RawGDetail>): AssembledData {
  let maxModified = 0;

  const bangumis: Bangumi[] = gList.map((item) => {
    const [id, cn, en, title, city, color, cover, fade, cat, lat, lng, zoom, pointMeta, abbr, tags, priority, icon] =
      item;
    const detail = detailMap.get(id);

    // 从 pointMeta 构建所有点位 geo/priority 索引
    // pointMeta 是扁平数组: [id, lat, lng, priority, id, lat, lng, priority, ...]
    const pointLookup: Record<string, { geo: [number, number]; priority: number }> = {};
    if (Array.isArray(pointMeta)) {
      for (let i = 0; i < pointMeta.length; i += 4) {
        const pid = pointMeta[i] as string;
        const plat = pointMeta[i + 1] as number;
        const plng = pointMeta[i + 2] as number;
        const ppriority = pointMeta[i + 3] as number;
        pointLookup[pid] = { geo: [plat, plng], priority: ppriority };
      }
    }

    const theme: Theme = detail ? toTheme(detail[1]) : { src: '', ids: [], modified: 0, w: 0, h: 0 };
    const rawPoints = detail && Array.isArray(detail[2]) ? detail[2] : [];

    const points: Point[] = rawPoints.map((rp: unknown) => {
      const base = toPoint(rp);
      const meta = pointLookup[base.id];
      return {
        ...base,
        geo: meta?.geo ?? ([0, 0] as [number, number]),
        priority: meta?.priority ?? 0,
      };
    });

    if (detail) {
      const m = detail[3];
      if (m > maxModified) maxModified = m;
    }

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
      geo: [lat, lng] as [number, number],
      zoom: zoom ?? 0,
      modified: detail?.[3] ?? 0,
      points,
      theme,
      abbr: abbr ? String(abbr) : '',
      tags: Array.isArray(tags) ? tags : [],
      priority: priority ?? 999,
      icon: icon || '',
    };
  });

  return {
    data: { bangumis, modified: maxModified },
  };
}

// ---------------------------------------------------------------------------
// 主入口：获取或刷新数据，通过回调报告进度
// ---------------------------------------------------------------------------

const G_JSON_URLS = [getG0JSON, getG1JSON, getG2JSON, getG3JSON, getG4JSON, getG5JSON] as const;

export async function fetchMapData(onProgress?: (p: FetchProgress) => void): Promise<AssembledData> {
  // 1. 检查本地缓存
  onProgress?.({ phase: 'checking', message: '检查缓存是否过时…' });

  const cachedModified = getGModified();
  const cachedData = getCachedData();

  // 如果无缓存，必须全量拉取
  if (cachedData === null || cachedModified === null) {
    return fetchFull(onProgress);
  }

  // 2. 拉取 g.json 判断 modified 是否变化
  const gRaw = (await getGJSON()) as [RawGBangumi[], number, number];
  const remoteModified = gRaw[2];

  if (remoteModified === cachedModified && cachedData) {
    onProgress?.({ phase: 'done', message: '数据已是最新' });
    return cachedData;
  }

  // 3. 不一致 → 全量拉取
  return fetchFull(onProgress);
}

async function fetchFull(onProgress?: (p: FetchProgress) => void): Promise<AssembledData> {
  onProgress?.({ phase: 'downloading', batch: 0, message: '加载番剧列表…' });

  // 先拉 g.json 获取基础信息
  const gRaw = (await getGJSON()) as [RawGBangumi[], number, number];
  const gList = gRaw[0] as RawGBangumi[];

  onProgress?.({ phase: 'downloading', batch: 1, message: '加载数据 1/6…' });

  // 并行拉取 g0-g5
  const detailResults = await Promise.allSettled(
    G_JSON_URLS.map((fn, i) =>
      fn().then((data) => {
        onProgress?.({ phase: 'downloading', batch: i + 2, message: `加载数据 ${i + 2}/6…` });
        return data as RawGDetail[];
      }),
    ),
  );

  // 合并所有成功的详情
  const detailMap = new Map<number, RawGDetail>();
  for (const result of detailResults) {
    if (result.status === 'fulfilled') {
      for (const entry of result.value) {
        detailMap.set(entry[0], entry);
      }
    }
  }

  onProgress?.({ phase: 'assembling', message: '数据组装中…' });

  // 组装
  const assembled = assembleBangumis(gList, detailMap);
  console.log('组装后的数据:', assembled);

  // 写入缓存
  setGModified(gRaw[2]);
  setCachedData(assembled);

  onProgress?.({ phase: 'done', message: '加载完成' });

  return assembled;
}
