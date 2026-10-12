export type MapCoordinate = [longitude: number, latitude: number];
export type MapViewportFootprint = MapCoordinate[];
export type MapViewportState = {
  zoom: number;
  bounds: { ne: MapCoordinate; sw: MapCoordinate } | null;
  footprint?: MapViewportFootprint;
};

function mercatorLatitude(latitude: number): number {
  const clamped = Math.max(-85.05112878, Math.min(85.05112878, latitude));
  return (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + (clamped * Math.PI) / 360));
}

/** Build one predicate per viewport, rather than projecting its corners for every point. */
export function createMapViewportContainsPoint(
  bounds: MapViewportState['bounds'],
  footprint?: MapViewportFootprint,
): (geo: readonly [latitude: number, longitude: number]) => boolean {
  if (footprint && footprint.length === 4 && footprint.every((corner) => corner.every(Number.isFinite))) {
    const west = bounds?.sw[0];
    const east = bounds?.ne[0];
    const longitudeSpan =
      west !== undefined && east !== undefined ? (east >= west ? east - west : east + 360 - west) : 0;
    // Put the longitude wrap cut opposite the viewport center, not on its west edge.
    // Bounds and native corner reads can differ slightly; an edge cut would shift
    // just one corner by 360 degrees and break a tilted viewport's polygon.
    const anchor = west !== undefined ? west + longitudeSpan / 2 - 180 : footprint[0][0] - 180;
    const unwrap = (longitude: number) => anchor + ((((longitude - anchor) % 360) + 360) % 360);
    // Straight screen edges are straight in Mercator, not in latitude/longitude.
    const polygon = footprint.map(([longitude, latitude]) => [unwrap(longitude), mercatorLatitude(latitude)]);
    const [originX, originY] = polygon[0];
    const area = polygon.reduce((sum, [ax, ay], index) => {
      const [bx, by] = polygon[(index + 1) % polygon.length];
      return sum + (ax - originX) * (by - originY) - (ay - originY) * (bx - originX);
    }, 0);
    if (area !== 0)
      return ([latitude, longitude]) => {
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
        const x = unwrap(longitude);
        const y = mercatorLatitude(latitude);
        let positive = false;
        let negative = false;
        for (let index = 0; index < polygon.length; index++) {
          const [ax, ay] = polygon[index];
          const [bx, by] = polygon[(index + 1) % polygon.length];
          const cross = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
          const tolerance = 1e-10 * Math.max(Math.abs(bx - ax), Math.abs(by - ay));
          if (cross > tolerance) positive = true;
          if (cross < -tolerance) negative = true;
          if (positive && negative) return false;
        }
        return true;
      };
  }

  return ([latitude, longitude]) => {
    if (!bounds || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
    const [west, south] = bounds.sw;
    const [east, north] = bounds.ne;
    const longitudeInBounds =
      west <= east ? longitude >= west && longitude <= east : longitude >= west || longitude <= east;
    return latitude >= south && latitude <= north && longitudeInBounds;
  };
}
