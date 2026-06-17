import { queryClient } from '@/lib/query/client';

export type OptimisticContext = {
  snapshots: Array<{ queryKey: readonly unknown[]; data: unknown }>;
};

const OPTIMISTIC_ID_PREFIX = 'optimistic-';

export function isOptimisticId(id: string): boolean {
  return id.startsWith(OPTIMISTIC_ID_PREFIX);
}

export function tempId(): string {
  return `${OPTIMISTIC_ID_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function beginOptimisticUpdate(
  keys: readonly (readonly unknown[])[]
): Promise<OptimisticContext> {
  await Promise.all(keys.map(key => queryClient.cancelQueries({ queryKey: key })));
  return {
    snapshots: keys.map(queryKey => ({
      queryKey,
      data: queryClient.getQueryData(queryKey),
    })),
  };
}

export function rollbackOptimisticUpdate(context: OptimisticContext | undefined): void {
  if (!context) return;
  for (const { queryKey, data } of context.snapshots) {
    queryClient.setQueryData(queryKey, data);
  }
}

export function appendListItem<T>(queryKey: readonly unknown[], item: T): void {
  queryClient.setQueryData<T[]>(queryKey, old => [...(old ?? []), item]);
}

export function removeListItem<T extends { id: string }>(
  queryKey: readonly unknown[],
  id: string
): void {
  queryClient.setQueryData<T[]>(queryKey, old => (old ?? []).filter(i => i.id !== id));
}

export function updateListItem<T extends { id: string }>(
  queryKey: readonly unknown[],
  id: string,
  updater: (item: T) => T
): void {
  queryClient.setQueryData<T[]>(queryKey, old =>
    (old ?? []).map(item => (item.id === id ? updater(item) : item))
  );
}

export function replaceOptimisticItem<T extends { id: string }>(
  queryKey: readonly unknown[],
  created: T
): void {
  queryClient.setQueryData<T[]>(queryKey, old => {
    const list = old ?? [];
    const withoutTemp = list.filter(i => !isOptimisticId(i.id));
    const exists = withoutTemp.some(i => i.id === created.id);
    if (exists) {
      return withoutTemp.map(i => (i.id === created.id ? created : i));
    }
    return [created, ...withoutTemp];
  });
}

export function setSingleEntity<T>(
  queryKey: readonly unknown[],
  entity: T
): void {
  queryClient.setQueryData(queryKey, entity);
}
