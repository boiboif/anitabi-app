import assert from 'node:assert/strict';
import test from 'node:test';
import { getMapMarkerOpacity } from '../../src/utils/map-marker-opacity.ts';

// Evaluate the small paint-expression subset used here against actual feature
// properties, including IDs repeated in different works. Native rendering still
// needs device validation; this checks selection identity and restoration.
function evaluate(expression, properties) {
  if (!Array.isArray(expression)) return expression;
  const [operator, ...args] = expression;
  switch (operator) {
    case 'get':
      return properties[args[0]];
    case '==':
      return evaluate(args[0], properties) === evaluate(args[1], properties);
    case 'all':
      return args.every((arg) => evaluate(arg, properties));
    case 'case':
      return evaluate(args[0], properties) ? evaluate(args[1], properties) : evaluate(args[2], properties);
    default:
      throw new Error(`Unexpected paint operator: ${operator}`);
  }
}

test('unselected and cleared markers remain fully visible', () => {
  const point = { bangumiId: 7, id: 'point' };
  assert.equal(evaluate(getMapMarkerOpacity(), point), 1);
  assert.equal(evaluate(getMapMarkerOpacity(null), point), 1);
});

test('only the selected work and point pair is hidden, including unusual string IDs', () => {
  const id = '123:["get","id"]';
  const expression = getMapMarkerOpacity({ bangumiId: 7, pointId: id });
  assert.equal(evaluate(expression, { bangumiId: 7, id }), 0);
  assert.equal(evaluate(expression, { bangumiId: 8, id }), 1);
  assert.equal(evaluate(expression, { bangumiId: 7, id: 'other' }), 1);
});

test('switching selection restores the old marker without changing either feature', () => {
  const first = Object.freeze({ bangumiId: 7, id: 'one' });
  const second = Object.freeze({ bangumiId: 7, id: 'two' });
  const selectedFirst = getMapMarkerOpacity({ bangumiId: 7, pointId: first.id });
  assert.equal(evaluate(selectedFirst, first), 0);
  assert.equal(evaluate(selectedFirst, second), 1);
  const selectedSecond = getMapMarkerOpacity({ bangumiId: 7, pointId: second.id });
  assert.equal(evaluate(selectedSecond, first), 1);
  assert.equal(evaluate(selectedSecond, second), 0);
  assert.equal(evaluate(getMapMarkerOpacity(null), second), 1);
});
