// ============================================================
// Raw API 返回类型
// ============================================================

/** g.json 单条番剧原始数据: [id, cn, en, title, city, color, cover, fade, cat, lat, lng, zoom, pointMeta, abbr, tags, priority, icon] */
export type RawGBangumi = [
  id: number,
  cn: string,
  en: number | string,
  title: string,
  city: string,
  color: string,
  cover: string,
  fade: number,
  cat: string,
  lat: number,
  lng: number,
  zoom: number,
  /** 点位简略信息（扁平数组）: [id, lat, lng, priority, id, lat, lng, priority, ...] */
  pointMeta: (string | number)[] | 0,
  abbr: string | 0,
  tags: string[] | 0,
  priority: number | null,
  icon: string,
];

/** g0-g5.json 单条番剧原始数据: [bangumiId, theme, points[], modified] */
export type RawGDetail = [
  bangumiId: number,
  theme: [src: string, ids: string[], modified: number, w: number, h: number],
  points: RawPoint[],
  modified: number,
];

/** g0-g5.json 中单个点位原始数据 */
export type RawPoint = [
  id: string,
  name: string,
  cn: number,
  isFolder: number,
  mid: number,
  uid: number,
  image: string,
  fid: number,
  ep: number | null,
  s: string,
  mark: string,
  origin: number,
  originLink: number,
  folder: string,
  density: number,
];

// ============================================================
// 组装后的业务类型
// ============================================================

export type Point = {
  id: string;
  name?: string;
  cn: string;
  isFolder: boolean;
  mid?: string;
  uid?: number;
  image?: string;
  fid?: string;
  ep?: number;
  s?: number;
  mark?: string;
  origin?: string;
  originLink?: string;
  folder?: string;
  density?: number;
  priority: number;
  geo: [number, number];
};

export type Theme = {
  src: string;
  ids: string[];
  modified: number;
  w: number;
  h: number;
};

export type Bangumi = {
  id: number;
  cn?: string;
  en?: string;
  title?: string;
  city?: string;
  color?: string;
  cover?: string;
  fade?: number;
  cat?: string;
  geo: [number, number];
  zoom?: number;
  modified: number;
  points: Point[];
  theme: Theme;
  abbr?: string;
  tags?: string[];
  priority?: number;
  icon?: string;
};

export type AssembledData = {
  data: {
    bangumis: Bangumi[];
    modified: number;
  };
};

// ============================================================
// 加载进度回调
// ============================================================

export type FetchPhase = 'checking' | 'downloading' | 'assembling' | 'done' | 'error';

export type FetchProgress = {
  phase: FetchPhase;
  /** downloading 时，已下载批次数 (0-6) */
  batch?: number;
  message?: string;
};