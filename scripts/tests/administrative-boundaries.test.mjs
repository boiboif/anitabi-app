import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../../src/utils/administrative-boundaries.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const { decodeBoundaries, findBoundary } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

test('decodes quantized delta arcs, reversed arcs, holes and multipolygons', () => {
  const topology = {
    type: 'Topology',
    transform: { scale: [1, 1], translate: [100, 20] },
    arcs: [
      [[0, 0], [10, 0], [0, 10], [-10, 0], [0, -10]],
      [[2, 2], [6, 0], [0, 6], [-6, 0], [0, -6]],
      [[20, 0], [5, 0], [0, 5], [-5, 0], [0, -5]],
    ],
    objects: { regions: { type: 'GeometryCollection', geometries: [
      { type: 'MultiPolygon', properties: { name: 'test' }, arcs: [[[0], [-2]], [[2]]] },
      { type: null },
    ] } },
  };
  const boundaries = decodeBoundaries(topology, 'regions');
  assert.equal(findBoundary(boundaries, 101, 21)?.properties.name, 'test');
  assert.equal(findBoundary(boundaries, 105, 25), null, 'hole is excluded');
  assert.equal(findBoundary(boundaries, 102, 25)?.properties.name, 'test', 'hole boundary is included');
  assert.equal(findBoundary(boundaries, 122, 22)?.properties.name, 'test', 'second polygon is included');
  assert.equal(findBoundary(boundaries, 110, 25)?.properties.name, 'test', 'outside edge is included');
  assert.equal(findBoundary(boundaries, 115, 25), null);
});

test('decodes unquantized coordinates and rejects corrupted topologies', () => {
  const topology = {
    type: 'Topology',
    arcs: [[[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]]],
    objects: { regions: { type: 'Polygon', properties: { n: 'region' }, arcs: [[0]] } },
  };
  assert.equal(findBoundary(decodeBoundaries(topology, 'regions'), 1, 1)?.properties.n, 'region');
  assert.throws(() => decodeBoundaries({ ...topology, arcs: [] }, 'regions'));
  assert.throws(() => decodeBoundaries(topology, 'missing'));
  assert.throws(() => decodeBoundaries({}, 'regions'));
});
