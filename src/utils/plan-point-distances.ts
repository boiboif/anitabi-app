const EARTH_RADIUS_METERS = 6_371_008.8;
const RAD = Math.PI / 180;

export function isValidCoordinate(latitude: number, longitude: number): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

function distanceMeters(latitude: number, longitude: number, targetLatitude: number, targetLongitude: number): number {
  const a =
    Math.sin(((targetLatitude - latitude) * RAD) / 2) ** 2 +
    Math.cos(latitude * RAD) *
      Math.cos(targetLatitude * RAD) *
      Math.sin(((targetLongitude - longitude) * RAD) / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(Math.max(0, Math.min(1, a))));
}

export type PlanDistanceLocation = { latitude: number; longitude: number };

type PlanPointWithCoordinates = {
  point?: { geo?: readonly number[] };
  item: { snapshot: { geo?: readonly number[] } };
};

function validPointGeo(geo: readonly number[] | undefined): geo is readonly [number, number] {
  return (
    Array.isArray(geo) &&
    geo.length === 2 &&
    isValidCoordinate(geo[0], geo[1]) &&
    // Match the map's treatment of Anitabi's missing-coordinate placeholder.
    (geo[0] !== 0 || geo[1] !== 0)
  );
}

/** Derive a display order without changing the saved plan or its original sequence numbers. */
export function sortPlanPointsByDistance<T extends PlanPointWithCoordinates>(
  items: readonly T[],
  location: PlanDistanceLocation | null,
): (T & { distanceMeters: number | null })[] {
  const hasLocation = location !== null && isValidCoordinate(location.latitude, location.longitude);
  return items
    .map((item, index) => {
      const liveGeo = item.point?.geo;
      const snapshotGeo = item.item.snapshot.geo;
      const geo = validPointGeo(liveGeo) ? liveGeo : !item.point && validPointGeo(snapshotGeo) ? snapshotGeo : null;
      return {
        index,
        entry: {
          ...item,
          distanceMeters:
            hasLocation && geo ? distanceMeters(location.latitude, location.longitude, geo[0], geo[1]) : null,
        },
      };
    })
    .sort((a, b) => {
      const first = a.entry.distanceMeters;
      const second = b.entry.distanceMeters;
      if (first === null) return second === null ? a.index - b.index : 1;
      if (second === null) return -1;
      return first - second || a.index - b.index;
    })
    .map(({ entry }) => entry);
}
