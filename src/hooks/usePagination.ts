import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_PAGE_SIZE,
  getStoredPageSize,
  getTotalPages,
  setStoredPageSize,
  slicePage,
} from '@/lib/pagination';

export function usePagination<T>(items: T[], resetDeps: unknown[] = []) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(getStoredPageSize);

  useEffect(() => {
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, resetDeps);

  const totalItems = items.length;
  const totalPages = getTotalPages(totalItems, pageSize);
  const safePage = Math.min(page, totalPages);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const paginatedItems = useMemo(
    () => slicePage(items, safePage, pageSize),
    [items, safePage, pageSize],
  );

  const setPageSize = useCallback((size: number) => {
    setStoredPageSize(size);
    setPageSizeState(size);
    setPage(1);
  }, []);

  const goToNextPage = useCallback(() => {
    setPage((current) => Math.min(current + 1, totalPages));
  }, [totalPages]);

  const goToPrevPage = useCallback(() => {
    setPage((current) => Math.max(current - 1, 1));
  }, []);

  return {
    page: safePage,
    setPage,
    pageSize,
    setPageSize,
    paginatedItems,
    totalItems,
    totalPages,
    hasNextPage: safePage < totalPages,
    hasPrevPage: safePage > 1,
    goToNextPage,
    goToPrevPage,
    defaultPageSize: DEFAULT_PAGE_SIZE,
  };
}
