import { create } from 'zustand';

/** 地图、列表和详情抽屉之间传递点位时使用的轻量引用。 */
export type MapPointReference = {
  bangumiId: number;
  pointId: string;
};

/**
 * 首页地图需要执行的一次性相机定位请求。
 * 请求由首页消费后清除，不与当前选中点位的持久状态混用。
 */
export type MapCameraRequest =
  | (MapPointReference & {
      id: number;
      kind: 'point';
      source: 'map-control' | 'external-list' | 'bangumi-detail-sheet';
    })
  | { id: number; kind: 'bangumi-overview'; bangumiId: number };

type MapBrowseState = {
  /** 当前正在浏览详情抽屉的番剧，不直接改变地图范围。 */
  openedBangumiDetailsId: number | null;
  /** 详情抽屉已在地图中应用的番剧范围，关闭详情时清除。 */
  filteredBangumiId: number | null;
  /** 当前在地图上展示弹窗的巡礼点。 */
  selectedMapPoint: MapPointReference | null;
  /** 保留最近一次弹窗点位，使隐藏后的卡片无需重新挂载。 */
  lastPopupMapPoint: MapPointReference | null;
  /** 等待首页地图执行的相机动作。 */
  mapCameraRequest: MapCameraRequest | null;

  /** 打开指定番剧的详情抽屉，并清除无关的点位和相机上下文。 */
  openBangumiDetails: (bangumiId: number) => void;
  /** 抽屉稳定降到 25% 后，首次筛选并定位该番剧。 */
  activateBangumiDetailsMap: (bangumiId: number) => void;
  /** 关闭番剧详情抽屉，不影响当前地图点位弹窗。 */
  closeBangumiDetails: () => void;
  /** 用户在地图内选择点位。 */
  selectMapPoint: (point: MapPointReference) => void;
  /** 用户通过地图控件选择点位，强制定位到该点。 */
  focusPointFromMapControl: (point: MapPointReference) => void;
  /** 用户从搜索或收藏列表选择点位，返回地图后强制定位到该点。 */
  focusPointFromList: (point: MapPointReference) => void;
  /** 用户从番剧详情抽屉选择点位，强制定位到该点。 */
  focusPointFromBangumiDetails: (point: MapPointReference) => void;
  /** 关闭地图点位弹窗，并取消尚未执行的定位请求。 */
  clearSelectedMapPoint: () => void;
  /** 首页完成相机动作后确认消费请求，防止数据更新时重复定位。 */
  completeMapCameraRequest: (requestId: number) => void;
};

// 请求序号仅用于识别已消费的相机动作，不属于业务状态。
let nextMapCameraRequestId = 1;

function createMapCameraRequest(
  point: MapPointReference,
  source: Extract<MapCameraRequest, { kind: 'point' }>['source'],
): MapCameraRequest {
  return { ...point, id: nextMapCameraRequestId++, kind: 'point', source };
}

export const useMapBrowse = create<MapBrowseState>((set) => ({
  openedBangumiDetailsId: null,
  filteredBangumiId: null,
  selectedMapPoint: null,
  lastPopupMapPoint: null,
  mapCameraRequest: null,

  openBangumiDetails: (bangumiId) =>
    set((state) => ({
      openedBangumiDetailsId: bangumiId,
      filteredBangumiId: state.openedBangumiDetailsId === bangumiId ? state.filteredBangumiId : null,
      selectedMapPoint: null,
      mapCameraRequest: null,
    })),
  activateBangumiDetailsMap: (bangumiId) =>
    set((state) =>
      state.openedBangumiDetailsId !== bangumiId || state.filteredBangumiId === bangumiId
        ? state
        : {
            filteredBangumiId: bangumiId,
            mapCameraRequest: { id: nextMapCameraRequestId++, kind: 'bangumi-overview', bangumiId },
          },
    ),
  closeBangumiDetails: () =>
    set((state) => ({
      openedBangumiDetailsId: null,
      filteredBangumiId: null,
      mapCameraRequest: state.mapCameraRequest?.kind === 'bangumi-overview' ? null : state.mapCameraRequest,
    })),

  selectMapPoint: (point) =>
    set({
      selectedMapPoint: point,
      lastPopupMapPoint: point,
      mapCameraRequest: null,
    }),

  focusPointFromMapControl: (point) =>
    set({
      openedBangumiDetailsId: null,
      filteredBangumiId: null,
      selectedMapPoint: point,
      lastPopupMapPoint: point,
      mapCameraRequest: createMapCameraRequest(point, 'map-control'),
    }),

  focusPointFromList: (point) =>
    set({
      openedBangumiDetailsId: null,
      filteredBangumiId: null,
      selectedMapPoint: point,
      lastPopupMapPoint: point,
      mapCameraRequest: createMapCameraRequest(point, 'external-list'),
    }),

  focusPointFromBangumiDetails: (point) =>
    set((state) =>
      state.openedBangumiDetailsId !== point.bangumiId
        ? state
        : {
            filteredBangumiId: point.bangumiId,
            selectedMapPoint: point,
            lastPopupMapPoint: point,
            mapCameraRequest: createMapCameraRequest(point, 'bangumi-detail-sheet'),
          },
    ),

  clearSelectedMapPoint: () => set({ selectedMapPoint: null, mapCameraRequest: null }),

  completeMapCameraRequest: (requestId) =>
    set((state) => (state.mapCameraRequest?.id === requestId ? { mapCameraRequest: null } : state)),
}));
