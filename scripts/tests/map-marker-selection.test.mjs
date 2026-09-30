import assert from 'node:assert/strict';
import test from 'node:test';
import { getUnselectedMapPointFilter } from '../../src/utils/map-point-style.ts';

function evaluate(expression, properties) {
  if (!Array.isArray(expression)) return expression;
  const [operator, ...args] = expression;
  switch (operator) {
    case 'get':
      return properties[args[0]];
    case '==':
      return evaluate(args[0], properties) === evaluate(args[1], properties);
    case '!=':
      return evaluate(args[0], properties) !== evaluate(args[1], properties);
    case 'all':
      return args.every((arg) => evaluate(arg, properties));
    case 'any':
      return args.some((arg) => evaluate(arg, properties));
    default:
      throw new Error(`Unexpected filter operator: ${operator}`);
  }
}

test('without a selection the existing layer filter is reused', () => {
  const baseFilter = ['==', ['get', 'priority'], 1];
  assert.equal(getUnselectedMapPointFilter(undefined), undefined);
  assert.equal(getUnselectedMapPointFilter(baseFilter), baseFilter);
  assert.equal(getUnselectedMapPointFilter(baseFilter, undefined, undefined), baseFilter);
});

test('only the selected work and point pair is excluded', () => {
  const pointId = '123:["get","id"]';
  const filter = getUnselectedMapPointFilter(undefined, 7, pointId);
  assert.equal(evaluate(filter, { bangumiId: 7, id: pointId }), false);
  assert.equal(evaluate(filter, { bangumiId: 8, id: pointId }), true);
  assert.equal(evaluate(filter, { bangumiId: 7, id: 'other' }), true);
});

test('selection combines with the existing visibility filter', () => {
  const baseFilter = ['==', ['get', 'priority'], 1];
  const filter = getUnselectedMapPointFilter(baseFilter, 7, 'selected');
  assert.equal(evaluate(filter, { bangumiId: 7, id: 'selected', priority: 1 }), false);
  assert.equal(evaluate(filter, { bangumiId: 7, id: 'other', priority: 1 }), true);
  assert.equal(evaluate(filter, { bangumiId: 7, id: 'other', priority: 2 }), false);
});

test('changing selection restores the previous point', () => {
  const first = { bangumiId: 7, id: 'one' };
  const second = { bangumiId: 7, id: 'two' };
  const selectedFirst = getUnselectedMapPointFilter(undefined, 7, first.id);
  const selectedSecond = getUnselectedMapPointFilter(undefined, 7, second.id);
  assert.equal(evaluate(selectedFirst, first), false);
  assert.equal(evaluate(selectedFirst, second), true);
  assert.equal(evaluate(selectedSecond, first), true);
  assert.equal(evaluate(selectedSecond, second), false);
});
