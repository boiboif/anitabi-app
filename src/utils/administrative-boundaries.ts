/** The upstream boundary files are quantized TopoJSON in longitude/latitude order. */
type Position = [number, number];
type Ring = Position[];
type Polygon = Ring[];

export type Boundary = {
  properties: Record<string, unknown>;
  polygons: Polygon[];
  bbox: [number, number, number, number];
};

type TopologyGeometry = {
  type: string;
  properties?: Record<string, unknown> | null;
  arcs?: unknown;
  geometries?: TopologyGeometry[];
};

type Topology = {
  type: 'Topology';
  transform?: { scale: Position; translate: Position };
  arcs: Position[][];
  objects: Record<string, TopologyGeometry>;
};

/** Decode and validate the geometry before accepting a downloaded cache entry. */
export function decodeBoundaries(value: unknown, objectName: string): Boundary[] {
  if (!value || typeof value !== 'object') throw new Error('Invalid topology');
  const topology = value as Topology;
  if (topology.type !== 'Topology' || !Array.isArray(topology.arcs) || !topology.objects?.[objectName]) {
    throw new Error('Invalid boundary topology');
  }
  const transform = topology.transform;
  if (
    transform &&
    (!Array.isArray(transform.scale) || !Array.isArray(transform.translate) ||
      ![...transform.scale, ...transform.translate].every(Number.isFinite))
  ) throw new Error('Invalid topology transform');

  const decodedArcs = topology.arcs.map((arc) => {
    if (!Array.isArray(arc) || arc.length < 2) throw new Error('Invalid topology arc');
    let x = 0;
    let y = 0;
    return arc.map((point): Position => {
      if (!Array.isArray(point) || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) {
        throw new Error('Invalid topology coordinate');
      }
      if (!transform) return [point[0], point[1]];
      x += point[0];
      y += point[1];
      return [x * transform.scale[0] + transform.translate[0], y * transform.scale[1] + transform.translate[1]];
    });
  });

  const decodeRing = (references: unknown): Ring => {
    if (!Array.isArray(references) || references.length === 0) throw new Error('Invalid ring');
    const ring: Ring = [];
    for (const reference of references) {
      if (!Number.isInteger(reference)) throw new Error('Invalid arc reference');
      const arc = decodedArcs[reference < 0 ? ~reference : reference];
      if (!arc) throw new Error('Missing topology arc');
      const points = reference < 0 ? [...arc].reverse() : arc;
      if (ring.length) ring.pop();
      ring.push(...points);
    }
    if (ring.length < 4) throw new Error('Invalid polygon ring');
    return ring;
  };

  const decodePolygon = (arcs: unknown): Polygon => {
    if (!Array.isArray(arcs) || arcs.length === 0) throw new Error('Invalid polygon');
    return arcs.map(decodeRing);
  };

  const boundaries: Boundary[] = [];
  const decodeGeometry = (geometry: TopologyGeometry) => {
    if (geometry.type === 'GeometryCollection') {
      if (!Array.isArray(geometry.geometries)) throw new Error('Invalid geometry collection');
      geometry.geometries.forEach(decodeGeometry);
      return;
    }
    if (!geometry.type) return; // Upstream includes a single empty geometry.
    let polygons: Polygon[];
    if (geometry.type === 'Polygon') polygons = [decodePolygon(geometry.arcs)];
    else if (geometry.type === 'MultiPolygon' && Array.isArray(geometry.arcs)) {
      polygons = geometry.arcs.map(decodePolygon);
    } else throw new Error('Unsupported boundary geometry');

    const bbox: Boundary['bbox'] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const polygon of polygons) for (const ring of polygon) for (const [longitude, latitude] of ring) {
      bbox[0] = Math.min(bbox[0], longitude);
      bbox[1] = Math.min(bbox[1], latitude);
      bbox[2] = Math.max(bbox[2], longitude);
      bbox[3] = Math.max(bbox[3], latitude);
    }
    if (!bbox.every(Number.isFinite)) throw new Error('Invalid boundary bounds');
    boundaries.push({ properties: geometry.properties ?? {}, polygons, bbox });
  };
  decodeGeometry(topology.objects[objectName]);
  if (boundaries.length === 0) throw new Error('Empty boundary topology');
  return boundaries;
}

// Returns -1 for a point on the ring, 1 for inside, and 0 for outside.
function locateInRing(point: Position, ring: Ring): -1 | 0 | 1 {
  let inside = false;
  const [x, y] = point;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const cross = (x - xi) * (yj - yi) - (y - yi) * (xj - xi);
    if (Math.abs(cross) < 1e-12 && x >= Math.min(xi, xj) && x <= Math.max(xi, xj) &&
      y >= Math.min(yi, yj) && y <= Math.max(yi, yj)) return -1;
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside ? 1 : 0;
}

/** First match mirrors the upstream map's ordering and includes polygon boundaries. */
export function findBoundary(boundaries: readonly Boundary[], longitude: number, latitude: number): Boundary | null {
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
  const point: Position = [longitude, latitude];
  for (const boundary of boundaries) {
    const [west, south, east, north] = boundary.bbox;
    if (longitude < west || longitude > east || latitude < south || latitude > north) continue;
    for (const polygon of boundary.polygons) {
      const exterior = locateInRing(point, polygon[0]);
      if (exterior === -1) return boundary;
      if (exterior === 0) continue;
      let inHole = false;
      for (const hole of polygon.slice(1)) {
        const result = locateInRing(point, hole);
        if (result === -1) return boundary;
        if (result === 1) { inHole = true; break; }
      }
      if (!inHole) return boundary;
    }
  }
  return null;
}
