export const DEFAULT_PAGE_SIZE = 20;

export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

export type PageSizeOption = (typeof PAGE_SIZE_OPTIONS)[number];

const PAGE_SIZE_STORAGE_KEY = 'oilshop_list_page_size';

export function getStoredPageSize(): number {
  try {
    const raw = localStorage.getItem(PAGE_SIZE_STORAGE_KEY);
    const parsed = raw ? Number(raw) : DEFAULT_PAGE_SIZE;
    if (PAGE_SIZE_OPTIONS.includes(parsed as PageSizeOption)) {
      return parsed;
    }
    return DEFAULT_PAGE_SIZE;
  } catch {
    return DEFAULT_PAGE_SIZE;
  }
}

export function setStoredPageSize(size: number): void {
  try {
    localStorage.setItem(PAGE_SIZE_STORAGE_KEY, String(size));
  } catch {
    // ignore quota errors
  }
}

export function slicePage<T>(items: T[], page: number, pageSize: number): T[] {
  const start = (page - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

export function getTotalPages(totalItems: number, pageSize: number): number {
  if (totalItems === 0) return 1;
  return Math.ceil(totalItems / pageSize);
}
