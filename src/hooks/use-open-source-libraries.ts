import Constants from 'expo-constants';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Library } from 'react-native-legal';

let cachedLibraries: Library[] | undefined;
let pendingRequest: Promise<Library[]> | undefined;

const buildOnlyLibraryPatterns = [
  /^@babel\/(?!runtime(?:$|\/))/i,
  /^@esbuild\//i,
  /^@expo\/cli$/i,
  /^@expo\/metro(?:$|-config$|-file-map$)/i,
  /^@jest\//i,
  /^@react-native-community\/cli(?:$|-)/i,
  /^@react-native\/codegen$/i,
  /^@rollup\//i,
  /^@swc\//i,
  /^@tamagui\/babel-plugin$/i,
  /^@types\//i,
  /^@typescript-eslint\//i,
  /^babel-(?:core|jest|plugin|preset)(?:$|-)/i,
  /^esbuild(?:$|-)/i,
  /^eslint(?:$|-)/i,
  /^expo-build-properties$/i,
  /^expo-dev-client$/i,
  /^jest(?:$|-)/i,
  /^metro(?!-runtime$)(?:$|-)/i,
  /^prettier(?:$|-)/i,
  /^react-native-builder-bob$/i,
  /^rollup(?:$|-)/i,
  /^terser(?:$|-)/i,
  /^ts-node(?:$|-)/i,
  /^typescript$/i,
  /^webpack(?:$|-)/i,
];

const configuredPrimaryPackageNames = Constants.expoConfig?.extra?.openSourceLicensePrimaryPackages;
const primaryPackageNames = new Set(
  Array.isArray(configuredPrimaryPackageNames)
    ? configuredPrimaryPackageNames.filter((packageName): packageName is string => typeof packageName === 'string')
    : [],
);

function compareLibraries(first: Library, second: Library) {
  return first.name.toLocaleLowerCase().localeCompare(second.name.toLocaleLowerCase());
}

function isDistributedLibrary(library: Library) {
  return !buildOnlyLibraryPatterns.some((pattern) => pattern.test(library.name));
}

async function requestLibraries() {
  const { ReactNativeLegal } = await import('react-native-legal');
  const result = await ReactNativeLegal.getLibrariesAsync();

  return result.data.filter(isDistributedLibrary).sort(compareLibraries);
}

export async function loadOpenSourceLibraries(force = false) {
  if (!force && cachedLibraries) return cachedLibraries;

  if (!pendingRequest || force) {
    pendingRequest = requestLibraries()
      .then((libraries) => {
        cachedLibraries = libraries;
        return libraries;
      })
      .finally(() => {
        pendingRequest = undefined;
      });
  }

  return pendingRequest;
}

export function useOpenSourceLibraries() {
  const [libraries, setLibraries] = useState<Library[]>(cachedLibraries ?? []);
  const [isLoading, setIsLoading] = useState(cachedLibraries === undefined);
  const [error, setError] = useState<string | null>(null);

  const retry = useCallback(() => {
    setIsLoading(true);
    setError(null);

    void loadOpenSourceLibraries(true)
      .then(setLibraries)
      .catch(() => {
        setError('许可证数据加载失败，请重新构建并安装应用后重试。');
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  useEffect(() => {
    let isActive = true;

    void loadOpenSourceLibraries()
      .then((result) => {
        if (isActive) setLibraries(result);
      })
      .catch(() => {
        if (isActive) setError('许可证数据加载失败，请重新构建并安装应用后重试。');
      })
      .finally(() => {
        if (isActive) setIsLoading(false);
      });

    return () => {
      isActive = false;
    };
  }, []);

  const hasPrimaryPackageMetadata = primaryPackageNames.size > 0;
  const { primaryLibraries, additionalLibraries } = useMemo(
    () => ({
      primaryLibraries: hasPrimaryPackageMetadata
        ? libraries.filter((library) => primaryPackageNames.has(library.name))
        : libraries,
      additionalLibraries: hasPrimaryPackageMetadata
        ? libraries.filter((library) => !primaryPackageNames.has(library.name))
        : [],
    }),
    [hasPrimaryPackageMetadata, libraries],
  );

  return {
    libraries,
    primaryLibraries,
    additionalLibraries,
    isLoading,
    error,
    retry,
  };
}
