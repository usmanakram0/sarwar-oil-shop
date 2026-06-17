import { useEffect, useState } from "react";
import { Loader2, Package, RotateCcw, XCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { formatMoney } from "@/lib/currency";
import type { InvoiceCloseMode } from "@/lib/invoiceLifecycle";
import type { Invoice } from "@/lib/storage";

interface InvoiceCloseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: Invoice | null;
  onConfirm: (mode: InvoiceCloseMode, restoreStock: boolean) => void;
  isLoading?: boolean;
}

export default function InvoiceCloseDialog({
  open,
  onOpenChange,
  invoice,
  onConfirm,
  isLoading = false,
}: InvoiceCloseDialogProps) {
  const [mode, setMode] = useState<InvoiceCloseMode>("return");
  const [restoreStock, setRestoreStock] = useState(true);

  useEffect(() => {
    if (!open) return;
    setMode("return");
    setRestoreStock(true);
  }, [open, invoice?.id]);

  if (!invoice) return null;

  const isHistorical = Boolean(invoice.historical);
  const willRestoreStock =
    mode === "return" ? !isHistorical : restoreStock && !isHistorical;

  const handleConfirm = () => {
    const shouldRestore = mode === "return" ? true : restoreStock;
    onConfirm(mode, shouldRestore);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">
            Close invoice {invoice.invoiceNumber}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Choose how to handle this order. The invoice stays on record for
            your books — it is not permanently erased.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setMode("return")}
            className={`w-full text-left p-4 rounded-lg border transition-all duration-200 ${
              mode === "return"
                ? "border-primary bg-primary/5 ring-1 ring-primary"
                : "border-border hover:border-primary/40"
            }`}>
            <div className="flex items-start gap-3">
              <RotateCcw
                className={`w-5 h-5 mt-0.5 shrink-0 ${mode === "return" ? "text-primary" : "text-muted-foreground"}`}
              />
              <div>
                <p className="font-heading font-semibold text-sm">
                  Customer return
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Customer brought the oil back. Stock is restored, sale is
                  removed from earnings and ledger.
                </p>
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setMode("void")}
            className={`w-full text-left p-4 rounded-lg border transition-all duration-200 ${
              mode === "void"
                ? "border-destructive bg-destructive/5 ring-1 ring-destructive"
                : "border-border hover:border-destructive/40"
            }`}>
            <div className="flex items-start gap-3">
              <XCircle
                className={`w-5 h-5 mt-0.5 shrink-0 ${mode === "void" ? "text-destructive" : "text-muted-foreground"}`}
              />
              <div>
                <p className="font-heading font-semibold text-sm">
                  Mistaken invoice
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Invoice was created by mistake. You can choose whether to put
                  oil back into containers.
                </p>
              </div>
            </div>
          </button>
        </div>

        <div className="rounded-lg bg-muted/40 border p-3 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Package className="w-4 h-4 text-muted-foreground" />
            <span>Items on this invoice</span>
          </div>
          <ul className="space-y-1 text-sm">
            {invoice.items.map((item, index) => (
              <li key={index} className="flex justify-between gap-2">
                <span className="text-muted-foreground">
                  {item.productName} · {item.quantity}L
                </span>
                <span>{formatMoney(item.total)}</span>
              </li>
            ))}
          </ul>
          <div className="flex justify-between text-sm font-heading font-semibold pt-2 border-t">
            <span>Total</span>
            <span>{formatMoney(invoice.total)}</span>
          </div>
        </div>

        {mode === "void" && !isHistorical && (
          <div className="flex items-start gap-3 p-3 rounded-lg border">
            <Checkbox
              id="restore-stock"
              checked={restoreStock}
              onCheckedChange={(checked) => setRestoreStock(checked === true)}
            />
            <div className="space-y-1">
              <Label
                htmlFor="restore-stock"
                className="text-sm font-medium cursor-pointer">
                Restore oil to containers
              </Label>
              <p className="text-xs text-muted-foreground">
                {invoice.items
                  .map((item) => `${item.quantity}L ${item.productName}`)
                  .join(", ")}{" "}
                will be added back to stock. Uncheck if the oil was never taken
                from the shop.
              </p>
            </div>
          </div>
        )}

        {mode === "return" && isHistorical && (
          <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
            Old records do not change container stock. Ledger and earnings will
            still be adjusted.
          </p>
        )}

        {willRestoreStock && !isHistorical && mode === "return" && (
          <p className="text-xs text-muted-foreground">
            {invoice.items.map((item) => `${item.quantity}L`).join(", ")} will
            be returned to containers. Customer ledger entries for this invoice
            will be removed.
          </p>
        )}

        {mode === "void" && !willRestoreStock && !isHistorical && (
          <p className="text-xs text-muted-foreground">
            Stock will not change. Ledger entries for this invoice will still be
            removed so earnings and customer balance stay correct.
          </p>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}>
            Cancel
          </Button>
          <Button
            type="button"
            variant={mode === "void" ? "destructive" : "default"}
            onClick={handleConfirm}
            disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                Processing...
              </>
            ) : mode === "return" ? (
              "Mark as returned"
            ) : (
              "Void invoice"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
