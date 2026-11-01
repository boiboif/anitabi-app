import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import * as navigation from '../../src/lib/pilgrimage-navigation.ts';

const { getAvailableNavigationMaps, normalizeNavigationMap, buildWalkingNavigationUrl } = navigation;

function loadModule(file, dependencies) {
  const source = readFileSync(new URL(file, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    require(name) {
      assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  });
  return exports;
}

test('Apple Maps is offered only on iOS and invalid saved preferences use the Google default', () => {
  assert.deepEqual(getAvailableNavigationMaps('ios'), ['googleMaps', 'amap', 'baiduMaps', 'appleMaps']);
  assert.deepEqual(getAvailableNavigationMaps('android'), ['googleMaps', 'amap', 'baiduMaps']);
  for (const value of [undefined, null, '', 'unknown', 'appleMaps']) {
    assert.equal(normalizeNavigationMap(value, 'android'), 'googleMaps');
  }
  assert.equal(normalizeNavigationMap('appleMaps', 'ios'), 'appleMaps');
  assert.equal(normalizeNavigationMap('amap', 'android'), 'amap');
});

test('Google URLs contain only the destination and explicitly request walking', () => {
  assert.equal(
    buildWalkingNavigationUrl('googleMaps', [35.7, 139.7], 'android'),
    'google.navigation:q=35.7,139.7&mode=w',
  );
  assert.equal(
    buildWalkingNavigationUrl('googleMaps', [35.7, 139.7], 'ios'),
    'comgooglemaps://?daddr=35.7,139.7&directionsmode=walking',
  );
  const webUrl = new URL(buildWalkingNavigationUrl('googleMaps', [35.7, 139.7], 'web'));
  assert.equal(webUrl.searchParams.get('destination'), '35.7,139.7');
  assert.equal(webUrl.searchParams.get('travelmode'), 'walking');
});

test('AMap and Baidu pass the destination with original WGS84 coordinate semantics', () => {
  for (const platform of ['ios', 'android']) {
    const amapUrl = new URL(buildWalkingNavigationUrl('amap', [39.9, 116.4], platform));
    assert.equal(amapUrl.searchParams.get('featureName'), 'OnFootNavi');
    assert.equal(amapUrl.searchParams.get('lat'), '39.9');
    assert.equal(amapUrl.searchParams.get('lon'), '116.4');
    assert.equal(amapUrl.searchParams.get('dev'), '1');
    const baiduUrl = new URL(buildWalkingNavigationUrl('baiduMaps', [39.9, 116.4], platform));
    assert.equal(baiduUrl.protocol, 'baidumap:');
    assert.equal(baiduUrl.searchParams.get('destination'), '39.9,116.4');
    assert.equal(baiduUrl.searchParams.get('coord_type'), 'wgs84');
    assert.equal(baiduUrl.searchParams.has('origin'), false);
    assert.equal(baiduUrl.pathname, platform === 'ios' ? '/walknavi' : '/direction');
    if (platform === 'android') assert.equal(baiduUrl.searchParams.get('mode'), 'walking');
  }
});

test('Apple Maps links request walking on iOS and reject other platforms', () => {
  assert.equal(buildWalkingNavigationUrl('appleMaps', [35.7, 139.7], 'ios'), 'maps://?daddr=35.7,139.7&dirflg=w');
  assert.throws(() => buildWalkingNavigationUrl('appleMaps', [35.7, 139.7], 'android'));
});

test('domestic and overseas destinations declare the source coordinate system once without mutating point data', () => {
  const destinations = [
    [39.908823, 116.39747], // Beijing
    [31.230391, 121.473701], // Shanghai
    [35.681236, 139.767125], // Tokyo
    [-33.86882, 151.209296], // Sydney
    [0, 10], // A valid equator destination
  ];
  for (const coordinates of destinations) {
    const geo = Object.freeze([...coordinates]);
    for (const platform of ['ios', 'android']) {
      for (const map of getAvailableNavigationMaps(platform)) {
        const url = buildWalkingNavigationUrl(map, geo, platform);
        const params =
          map === 'googleMaps' && platform === 'android'
            ? new URLSearchParams(url.slice('google.navigation:'.length))
            : new URL(url).searchParams;
        const expected = coordinates.join(',');
        if (map === 'amap') {
          assert.equal(params.get('lat'), String(coordinates[0]));
          assert.equal(params.get('lon'), String(coordinates[1]));
          assert.deepEqual(params.getAll('dev'), ['1'], 'delegate WGS84 conversion to AMap exactly once');
        } else if (map === 'baiduMaps') {
          assert.equal(params.get('destination'), expected);
          assert.deepEqual(params.getAll('coord_type'), ['wgs84'], 'never label WGS84 as Baidu coordinates');
        } else {
          assert.equal(params.get(map === 'googleMaps' && platform === 'android' ? 'q' : 'daddr'), expected);
          assert.equal(params.has('dev'), false);
          assert.equal(params.has('coord_type'), false);
        }
        assert.deepEqual(geo, coordinates, 'opening another map cannot alter the original point or stored plan');
      }
    }
  }
});

test('every provider leaves start-location handling to the target app', () => {
  for (const platform of ['ios', 'android']) {
    for (const map of getAvailableNavigationMaps(platform)) {
      const url = buildWalkingNavigationUrl(map, [35.7, 139.7], platform);
      assert.doesNotMatch(url, /(?:[?&])(?:origin|saddr|slat|slon|source|start)=/i);
      assert.equal(url.includes(encodeURIComponent('我的位置')), false);
    }
  }
  for (const path of [
    '../../src/lib/pilgrimage-navigation.ts',
    '../../src/components/point/point-navigation-button.tsx',
  ]) {
    assert.doesNotMatch(
      readFileSync(new URL(path, import.meta.url), 'utf8'),
      /expo-location|navigation-location|getNavigationOrigin/,
    );
  }
});

test('missing destination coordinates never launch a placeholder or invalid destination', () => {
  for (const geo of [
    [0, 0],
    [NaN, 139],
    [35, Infinity],
    [91, 139],
    [35, 181],
  ]) {
    assert.throws(() => buildWalkingNavigationUrl('googleMaps', geo, 'android'));
  }
  assert.ok(buildWalkingNavigationUrl('googleMaps', [0, 10], 'android'));
});

test('map preference hydrates synchronously and persists selection', () => {
  let saved;
  const createStore = (platform) =>
    loadModule('../../src/store/use-pilgrimage-preferences.ts', {
      '@/lib/pilgrimage-navigation': navigation,
      '@/lib/storage': {
        getNavigationMapPreference: () => saved,
        setNavigationMapPreference: (value) => {
          saved = value;
        },
      },
      'react-native': { Platform: { OS: platform } },
      zustand: {
        create: (initialize) => {
          let state = initialize((next) => {
            state = { ...state, ...next };
          });
          return (select) => select(state);
        },
      },
    }).usePilgrimagePreferences;
  const store = createStore('ios');
  assert.equal(
    store((state) => state.navigationMap),
    'googleMaps',
  );
  store((state) => state.setNavigationMap)('appleMaps');
  assert.equal(
    createStore('ios')((state) => state.navigationMap),
    'appleMaps',
  );
  assert.equal(
    createStore('android')((state) => state.navigationMap),
    'googleMaps',
  );
});

function navigationButton(platform, map, open = async () => {}) {
  const opens = [];
  const alerts = [];
  const jsx = (type, props) => ({ type, props });
  const { default: Button } = loadModule('../../src/components/point/point-navigation-button.tsx', {
    '@/lib/pilgrimage-navigation': navigation,
    '@/store/use-pilgrimage-preferences': { usePilgrimagePreferences: (select) => select({ navigationMap: map }) },
    '@tamagui/lucide-icons-2': { Navigation: 'Navigation' },
    react: { useRef: (current) => ({ current }) },
    'react-native': {
      Platform: { OS: platform },
      Pressable: 'Pressable',
      Linking: {
        openURL: async (url) => {
          opens.push(url);
          await open(url);
        },
      },
      Alert: { alert: (...args) => alerts.push(args) },
    },
    'react-i18next': {
      useTranslation: () => ({ t: (key, options) => (options?.map ? `${key}:${options.map}` : key) }),
    },
    tamagui: { useTheme: () => ({ primary: { val: 'purple' } }), View: 'View' },
    'react/jsx-runtime': { jsx, jsxs: jsx },
  });
  return { tree: Button({ point: { id: 'point', geo: [35.7, 139.7] } }), opens, alerts };
}

test('navigation buttons directly open the selected app URL without location or permission dependencies', async () => {
  for (const platform of ['ios', 'android']) {
    for (const map of getAvailableNavigationMaps(platform)) {
      const { tree, opens, alerts } = navigationButton(platform, map);
      let stopped = false;
      const pending = tree.props.onPress({
        stopPropagation: () => {
          stopped = true;
        },
      });
      assert.equal(opens.length, 1, 'URL launch starts immediately without waiting for a location fix');
      await pending;
      assert.equal(stopped, true);
      assert.equal(tree.props.accessibilityLabel, `navigateWithMap:${map}`);
      assert.equal(opens[0], buildWalkingNavigationUrl(map, [35.7, 139.7], platform));
      assert.equal(alerts.length, 0);
    }
  }
});

test('failed launches show a clear error without switching apps and allow retry', async () => {
  const { tree, opens, alerts } = navigationButton('android', 'baiduMaps', async () => {
    throw new Error('Missing app');
  });
  await tree.props.onPress({ stopPropagation() {} });
  assert.equal(opens.length, 1);
  assert.equal(alerts[0][0], 'couldNotOpenNavigation');
  assert.equal(alerts[0][1], 'pleaseInstallMapOrChangeNavigationSettings:baiduMaps');
  await tree.props.onPress({ stopPropagation() {} });
  assert.equal(opens.length, 2);
});

test('rapid duplicate presses launch a single URL until the native open request settles', async () => {
  let resolve;
  const native = new Promise((yes) => {
    resolve = yes;
  });
  const { tree, opens } = navigationButton('android', 'baiduMaps', () => native);
  const first = tree.props.onPress({ stopPropagation() {} });
  await tree.props.onPress({ stopPropagation() {} });
  assert.equal(opens.length, 1);
  resolve();
  await first;
  await tree.props.onPress({ stopPropagation() {} });
  assert.equal(opens.length, 2);
});
