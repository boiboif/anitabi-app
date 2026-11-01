export type NavigationMap = 'googleMaps' | 'amap' | 'baiduMaps' | 'appleMaps';

const COMMON_NAVIGATION_MAPS: NavigationMap[] = ['googleMaps', 'amap', 'baiduMaps'];

export function getAvailableNavigationMaps(platform: string): NavigationMap[] {
  return platform === 'ios' ? [...COMMON_NAVIGATION_MAPS, 'appleMaps'] : [...COMMON_NAVIGATION_MAPS];
}

export function normalizeNavigationMap(value: unknown, platform: string): NavigationMap {
  return getAvailableNavigationMaps(platform).find((map) => map === value) ?? 'googleMaps';
}

function isValidGeo(geo: readonly [number, number] | undefined): geo is readonly [number, number] {
  return (
    !!geo &&
    Number.isFinite(geo[0]) &&
    Number.isFinite(geo[1]) &&
    Math.abs(geo[0]) <= 90 &&
    Math.abs(geo[1]) <= 180 &&
    (geo[0] !== 0 || geo[1] !== 0)
  );
}

/**
 * Destinations stay in the point data's WGS84 [latitude, longitude] order.
 * AMap's dev=1 and Baidu's coord_type=wgs84 let the target app handle its
 * coordinate conversion. Do not pre-convert these inputs and apply it twice.
 */
export function buildWalkingNavigationUrl(
  map: NavigationMap,
  geo: readonly [number, number],
  platform: string,
): string {
  if (!isValidGeo(geo)) throw new Error('Invalid navigation coordinates');
  const [latitude, longitude] = geo;
  const destination = `${latitude},${longitude}`;
  switch (map) {
    case 'googleMaps':
      if (platform === 'ios') return `comgooglemaps://?daddr=${destination}&directionsmode=walking`;
      if (platform === 'android') return `google.navigation:q=${destination}&mode=w`;
      return `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=walking&dir_action=navigate`;
    case 'amap':
      // Let AMap convert the original WGS84 coordinates, rather than treating them as GCJ-02.
      // https://lbs.amap.com/api/amap-mobile/guide/ios/walk-navi (also supported on Android)
      return `amapuri://openFeature?featureName=OnFootNavi&sourceApplication=Anitabi&lat=${latitude}&lon=${longitude}&dev=1`;
    case 'baiduMaps':
      // https://lbsyun.baidu.com/docs/webapi?title=mapadjustment/uri/ios
      // https://lbsyun.baidu.com/docs/webapi?title=mapadjustment/uri/andriod
      if (platform === 'ios') {
        return `baidumap://map/walknavi?destination=${destination}&coord_type=wgs84&src=ios.anitabi.app`;
      }
      // Leave start-location handling to Baidu. Android's documented direction API requires
      // origin, so destination-only handling must be verified with the installed Baidu app.
      return `baidumap://map/direction?destination=${destination}&mode=walking&coord_type=wgs84&src=andr.anitabi.app`;
    case 'appleMaps':
      if (platform !== 'ios') throw new Error('Apple Maps navigation is only available on iOS');
      // The legacy URL also supports our minimum iOS 16.4 deployment target.
      return `maps://?daddr=${destination}&dirflg=w`;
  }
}
