import { useCategoryNamesQuery } from '@/hooks/useShopData';
import { safeArray } from '@/lib/query/safe';

export function useCategoryNames(): string[] {
  const { data } = useCategoryNamesQuery();
  return safeArray(data);
}
