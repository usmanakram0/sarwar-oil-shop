import { useState } from 'react';
import ConfirmDataOverwriteDialog from '@/components/ConfirmDataOverwriteDialog';
import { getLocalTenantRecordSummary } from '@/lib/storage';
import { useSync } from '@/contexts/SyncContext';
import { toast } from 'sonner';

interface CloudDownloadOfferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function CloudDownloadOfferDialog({
  open,
  onOpenChange,
}: CloudDownloadOfferDialogProps) {
  const { pullFromCloud } = useSync();
  const [pulling, setPulling] = useState(false);
  const summary = getLocalTenantRecordSummary();

  const handleConfirm = async () => {
    setPulling(true);
    const result = await pullFromCloud(false);
    setPulling(false);

    if (result.ok) {
      toast.success(result.message || 'Downloaded shop data from cloud');
      onOpenChange(false);
      return;
    }

    toast.error(result.message || 'Could not download from cloud');
  };

  return (
    <ConfirmDataOverwriteDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Download shop data from cloud?"
      actionLabel="Yes, replace device data from cloud"
      summary={summary}
      warnings={[
        'This device has no shop records yet. Downloading will load whatever is stored in the cloud account.',
        'If the cloud copy is older or incomplete, newer invoices on another device may be missing.',
      ]}
      onConfirm={handleConfirm}
      isLoading={pulling}
    />
  );
}
