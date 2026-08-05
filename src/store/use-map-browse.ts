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
type MapCameraRequest = MapPointReference & {
  id: number;
  /** 地图内点选会尊重当前高缩放级别；外部列表点选始终定位。 */
  source: 'map-point-selection' | 'external-list';
};

type MapBrowseState = {
  /** 当前正在浏览详情抽屉的番剧，同时用于地图展示该番剧的点位。 */
  openedBangumiDetailsId: number | null;
  /** 当前在地图上展示弹窗的巡礼点。 */
  selectedMapPoint: MapPointReference | null;
  /** 等待首页地图执行的相机动作。 */
  mapCameraRequest: MapCameraRequest | null;

  /** 打开指定番剧的详情抽屉，并清除无关的点位和相机上下文。 */
  openBangumiDetails: (bangumiId: number) => void;
  /** 关闭番剧详情抽屉，不影响当前地图点位弹窗。 */
  closeBangumiDetails: () => void;
  /** 用户在地图或详情抽屉内选择点位，按当前地图缩放级别决定是否定位。 */
  selectMapPoint: (point: MapPointReference) => void;
  /** 用户从搜索或收藏列表选择点位，返回地图后强制定位到该点。 */
  focusPointFromList: (point: MapPointReference) => void;
  /** 关闭地图点位弹窗，并取消尚未执行的定位请求。 */
  clearSelectedMapPoint: () => void;
  /** 首页完成相机动作后确认消费请求，防止数据更新时重复定位。 */
  completeMapCameraRequest: (requestId: number) => void;
};

// 请求序号仅用于识别已消费的相机动作，不属于业务状态。
let nextMapCameraRequestId = 1;

function createMapCameraRequest(point: MapPointReference, source: MapCameraRequest['source']): MapCameraRequest {
  return { ...point, id: nextMapCameraRequestId++, source };
}

export const useMapBrowse = create<MapBrowseState>((set) => ({
  openedBangumiDetailsId: null,
  selectedMapPoint: null,
  mapCameraRequest: null,

  openBangumiDetails: (bangumiId) =>
    set({ openedBangumiDetailsId: bangumiId, selectedMapPoint: null, mapCameraRequest: null }),
  closeBangumiDetails: () => set({ openedBangumiDetailsId: null }),

  selectMapPoint: (point) =>
    set({
      selectedMapPoint: point,
      mapCameraRequest: createMapCameraRequest(point, 'map-point-selection'),
    }),

  focusPointFromList: (point) =>
    set({
      openedBangumiDetailsId: null,
      selectedMapPoint: point,
      mapCameraRequest: createMapCameraRequest(point, 'external-list'),
    }),

  clearSelectedMapPoint: () => set({ selectedMapPoint: null, mapCameraRequest: null }),

  completeMapCameraRequest: (requestId) =>
    set((state) => (state.mapCameraRequest?.id === requestId ? { mapCameraRequest: null } : state)),
}));
