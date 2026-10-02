import type { Bangumi, Point } from '@/services/types';
import { createContext, lazy, Suspense, type ReactNode, use, useCallback, useMemo, useRef, useState } from 'react';

type PlanPickerContextValue = {
  open: (point: Point, bangumi: Bangumi) => void;
};

export type PlanPickerTarget = { point: Point; bangumi: Bangumi; requestId: number };

const PlanPickerContext = createContext<PlanPickerContextValue | null>(null);
const PlanPickerSheet = lazy(() => import('./plan-picker-sheet'));

export function usePlanPicker(): PlanPickerContextValue {
  const value = use(PlanPickerContext);
  if (!value) throw new Error('usePlanPicker must be used inside PlanPickerProvider');
  return value;
}

export default function PlanPickerProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<PlanPickerTarget | null>(null);
  const nextRequestId = useRef(0);
  const open = useCallback(
    (point: Point, bangumi: Bangumi) => setTarget({ point, bangumi, requestId: ++nextRequestId.current }),
    [],
  );
  function close(requestId: number) {
    setTarget((current) => (current?.requestId === requestId ? null : current));
  }
  const contextValue = useMemo(() => ({ open }), [open]);

  return (
    <PlanPickerContext.Provider value={contextValue}>
      {children}
      {target && (
        <Suspense fallback={null}>
          <PlanPickerSheet key={target.requestId} target={target} onDidDismiss={() => close(target.requestId)} />
        </Suspense>
      )}
    </PlanPickerContext.Provider>
  );
}
