import { MAP_3D_PITCH } from '@/lib/constants';
import type { Viewport } from '@rnmapbox/maps';
import { useCallback, useEffect, useRef, useState } from 'react';

type LocationMode = 'browse' | 'centered' | 'following' | 'detached' | 'recentering';

type Options = {
  handleLocate: (options: { resetOrientation: boolean }) => Promise<boolean>;
  cancelPendingCameraMovement: () => void;
  isLocationPuckActive: boolean;
  setShow3DBuildings: (enabled: boolean) => void;
};

export function useHomeMapLocate({
  handleLocate,
  cancelPendingCameraMovement,
  isLocationPuckActive,
  setShow3DBuildings,
}: Options) {
  const locationViewportRef = useRef<Viewport>(null);
  const [locationMode, setLocationMode] = useState<LocationMode>('browse');
  const modeRef = useRef<LocationMode>('browse');
  const requestRef = useRef<{ kind: 'locate' | 'follow' } | null>(null);
  const releaseRef = useRef<Promise<void> | null>(null);

  const updateMode = useCallback((mode: LocationMode) => {
    modeRef.current = mode;
    setLocationMode(mode);
  }, []);

  const stopLocationTracking = useCallback((nextMode: 'detached' | 'recentering' = 'detached') => {
    const mode = modeRef.current;
    if (requestRef.current?.kind === 'locate' || mode === 'centered') cancelPendingCameraMovement();
    requestRef.current = null;

    if (mode === 'centered') updateMode('browse');
    if (mode === 'recentering') updateMode('detached');
    if (mode !== 'following') return releaseRef.current;

    updateMode(nextMode);
    const viewport = locationViewportRef.current;
    if (!viewport) return null;

    // Stop the native viewport before an imperative camera move takes over.
    const release = viewport.idle().catch(() => undefined);
    releaseRef.current = release;
    void release.then(() => {
      if (releaseRef.current === release) releaseRef.current = null;
    });
    return release;
  }, [cancelPendingCameraMovement, updateMode]);

  useEffect(() => {
    if (!isLocationPuckActive && modeRef.current === 'following') stopLocationTracking();
  }, [isLocationPuckActive, stopLocationTracking]);

  function handleFollowInterrupted() {
    if (modeRef.current === 'following') stopLocationTracking();
  }

  async function handleLocatePress() {
    if (requestRef.current?.kind === 'locate') return;

    const mode = modeRef.current;
    const viewport = locationViewportRef.current;
    if (mode === 'centered' && viewport && isLocationPuckActive) {
      cancelPendingCameraMovement();
      const request = { kind: 'follow' } as const;
      requestRef.current = request;
      updateMode('following');
      setShow3DBuildings(true);

      let started = false;
      try {
        started = await viewport.transitionTo(
          { kind: 'followPuck', options: { bearing: 'heading', pitch: MAP_3D_PITCH, zoom: 16 } },
          { kind: 'default', maxDurationMs: 500 },
        );
      } catch {
        // The map can detach before the native transition is dispatched.
      }
      if (requestRef.current === request) {
        requestRef.current = null;
        if (!started) stopLocationTracking();
      }
      return;
    }

    const resetOrientation = mode === 'following' || mode === 'detached';
    const release = stopLocationTracking('recentering');
    const request = { kind: 'locate' } as const;
    requestRef.current = request;
    try {
      if (release) await release;
      if (requestRef.current !== request) return;
      const moved = await handleLocate({ resetOrientation });
      if (!moved || requestRef.current !== request) return;
      if (resetOrientation) setShow3DBuildings(false);
      updateMode('centered');
    } finally {
      if (requestRef.current === request) {
        requestRef.current = null;
        if (modeRef.current === 'recentering') updateMode('detached');
      }
    }
  }

  // An explicit reset keeps the follow icon until the recenter command is issued.
  const locateButtonMode = locationMode === 'recentering' ? 'following' : locationMode === 'detached' ? 'browse' : locationMode;
  return {
    locationViewportRef,
    locateButtonMode,
    handleLocatePress,
    stopLocationTracking,
    handleFollowInterrupted,
  };
}
