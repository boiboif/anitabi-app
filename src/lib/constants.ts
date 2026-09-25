/** Anitabi 官网在 zoom >= 13 时隐藏作品 icon 图层。 */
export const MAP_ICON_ZOOM_THRESHOLD = 13;

/** Anitabi 官网作品 icon 的 zoom -> 最低 priority（严格大于）映射。 */
export const MAP_BANGUMI_ICON_PRIORITY_ZOOM_STOPS = [
  [0, 760_000],
  [2, 420_000],
  [3, 160_000],
  [3.5, 130_000],
  [4, 100_000],
  [4.5, 70_000],
  [5, 55_000],
  [6, 28_800],
  [7, 14_400],
  [8, 7_200],
  [9, 3_600],
  [10, 1_800],
  [11, 900],
  [12, 450],
] as const;

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

/** 图片出现的最低 zoom（zoom >= 此值时显示巡礼点图片）。 */
export const MAP_ICON_ZOOM_THRESHOLD_SHOW_IMAGE = 18;

/** 筛选模式下，图片出现的最低 zoom（zoom >= 此值时显示巡礼点图片）。 */
export const FILTER_MODE_MAP_ICON_ZOOM_THRESHOLD_SHOW_IMAGE = 18;

/** 图片稀疏曲线基准级相对出图阈值的偏移：基准级 = 阈值 + 此值。值越大，同一 zoom 下图片越稀疏。 */
export const MAP_IMAGE_PRIORITY_BASE_ZOOM_OFFSET = 1;
