import { AlertTriangle, Loader2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { LocalTenantRecordSummary } from '@/lib/storage';

interface ConfirmDataOverwriteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  actionLabel: string;
  summary: LocalTenantRecordSummary | null;
  warnings: string[];
  onConfirm: () => void;
  isLoading?: boolean;
}

function RecordSummaryList({ summary }: { summary: LocalTenantRecordSummary }) {
  if (summary.total === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        This device currently has no shop records saved.
      </p>
    );
  }

  return (
    <ul className="text-sm space-y-1">
      <li>
        <span className="font-medium">{summary.invoices}</span> invoices
      </li>
      <li>
        <span className="font-medium">{summary.customers}</span> customers
      </li>
      <li>
        <span className="font-medium">{summary.products}</span> products
      </li>
      <li>
        <span className="font-medium">{summary.payments}</span> payments
      </li>
      <li>
        <span className="font-medium">{summary.stockPurchases}</span> stock
        purchases
      </li>
      <li>
        <span className="font-medium">{summary.suppliers}</span> suppliers
      </li>
    </ul>
  );
}

export default function ConfirmDataOverwriteDialog({
  open,
  onOpenChange,
  title,
  actionLabel,
  summary,
  warnings,
  onConfirm,
  isLoading = false,
}: ConfirmDataOverwriteDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md border-destructive/40">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-heading flex items-center gap-2 text-destructive">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm text-muted-foreground">
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-2">
                <p className="font-semibold text-destructive">
                  Emergency warning — this cannot be undone
                </p>
                {warnings.map((warning) => (
                  <p key={warning}>{warning}</p>
                ))}
              </div>

              {summary && (
                <div className="rounded-lg border p-3 space-y-2">
                  <p className="font-medium text-foreground">
                    Records on this device that will be replaced:
                  </p>
                  <RecordSummaryList summary={summary} />
                </div>
              )}

              <p className="font-medium text-foreground">
                Export a backup from Settings first if you are not completely
                sure.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>Cancel — keep my data</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors duration-200"
            disabled={isLoading}
            onClick={(event) => {
              event.preventDefault();
              onConfirm();
            }}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                Working…
              </>
            ) : (
              actionLabel
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
