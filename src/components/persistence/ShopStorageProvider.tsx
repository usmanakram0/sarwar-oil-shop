import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { hydrateShopStorage, resetShopStorageSession } from '@/lib/persistence/shopStorage';
import { clearStorageCache, normalizeStoredDailySlipNumbers } from '@/lib/storage';
import PageLoader from '@/components/layout/PageLoader';

export default function ShopStorageProvider() {
  const { isAuthenticated, session, isLoading } = useAuth();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated || !session) {
      resetShopStorageSession();
      clearStorageCache();
      setReady(true);
      return;
    }

    let cancelled = false;
    setReady(false);

    void hydrateShopStorage(session.tenantId).then(() => {
      if (cancelled) return;
      normalizeStoredDailySlipNumbers();
      clearStorageCache();
      setReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isLoading, session?.tenantId]);

  if (isLoading || (isAuthenticated && !ready)) {
    return <PageLoader />;
  }

  return <Outlet />;
}
