type ImageCandidate = {
  order: number;
  point: { geo: readonly [number, number] };
};

/** Assign unique draw keys to latitude-sorted images without changing their north/south order. */
export function getStableMapImageSortKeys(byLatitude: readonly ImageCandidate[], candidateCount: number): Uint32Array {
  // Zero means that a candidate has no valid latitude. Store ranks plus one.
  const keys = new Uint32Array(candidateCount);

  // North first gets the lowest key. Within one latitude, later source items
  // get higher keys, so equal-latitude images cannot exchange draw order.
  for (let end = byLatitude.length; end > 0; ) {
    let start = end - 1;
    const latitude = byLatitude[start].point.geo[0];
    while (start > 0 && byLatitude[start - 1].point.geo[0] === latitude) start--;

    const base = byLatitude.length - end;
    for (let index = start; index < end; index++) {
      keys[byLatitude[index].order] = base + index - start + 1;
    }
    end = start;
  }

  return keys;
}
