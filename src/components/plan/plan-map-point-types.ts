import type { PlanItem } from '@/lib/plan-storage';
import type { Bangumi, Point } from '@/services/types';

export type PlanMapResolvedPoint = {
  item: PlanItem;
  planIndex: number;
  point: Point;
  bangumi: Bangumi;
};
