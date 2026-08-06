/** zoom >= 此值时地图上的叠加 icon 完全隐藏，转为顶栏胶囊列表展示 */
export const MAP_ICON_ZOOM_THRESHOLD = 12.5;

/** Anitabi 的普通巡礼点在该 zoom 起不再按 priority 筛选。 */
export const MAP_POINT_PRIORITY_ALL_VISIBLE_ZOOM = 17;

/** Anitabi 普通巡礼点的 zoom -> 最低 priority（严格大于）映射。 */
export const MAP_POINT_PRIORITY_ZOOM_STOPS = [
  [0, 60_000],
  [2, 36_000],
  [3, 24_000],
  [4, 12_000],
  [5, 6_000],
  [6, 3_000],
  [7, 1_500],
  [8, 600],
  [9, 300],
  [10, 150],
  [11, 100],
  [12, 40],
  [13, 20],
  [14, 10],
  [15, 5],
  [16, 3],
] as const;

/** 当 zoom 大于此值时，地图中显示巡礼点图片。 */
export const MAP_ICON_ZOOM_THRESHOLD_SHOW_IMAGE = 18;

/** 筛选模式下，当 zoom 大于此值时，地图中显示巡礼点图片。 */
export const FILTER_MODE_MAP_ICON_ZOOM_THRESHOLD_SHOW_IMAGE = 18;
