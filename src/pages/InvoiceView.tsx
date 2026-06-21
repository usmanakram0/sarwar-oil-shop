import { useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Printer, Wallet, FileText, ClipboardList, Loader2, Trash2, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { FormLabel } from '@/components/ui/FormLabel';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SHOP_NAME } from '@/lib/shop';
import { CURRENCY, formatMoney } from '@/lib/currency';
import {
  formatProductPriceSuffix,
  formatLineItemQuantityWithUnit,
  lineItemDisplayName,
} from '@/lib/productTypes';
import { getInvoiceSlipLabel } from '@/lib/dailySlipNumber';
import { getInvoiceDiscountAmount } from '@/lib/storage';
import { getInvoiceCustomerName } from '@/lib/walkingCustomer';
import { buildInvoiceReceiptHtml } from '@/lib/printing/invoiceReceipts';
import { printReceiptBatch } from '@/lib/printing/printService';
import { useCustomerQuery, useInvoiceQuery, useSettingsQuery } from '@/hooks/useShopData';
import { useInvoiceMutations } from '@/hooks/useShopMutations';
import { safeString } from '@/lib/query/safe';
import { format } from 'date-fns';
import { toast } from 'sonner';
import InvoiceCloseDialog from '@/components/InvoiceCloseDialog';
import { isInvoiceClosed, isInvoiceEdited } from '@/lib/invoiceLifecycle';
import type { InvoiceCloseMode } from '@/lib/invoiceLifecycle';

export default function InvoiceView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: invoice } = useInvoiceQuery(id);
  const { data: settings } = useSettingsQuery();
  const { data: customer } = useCustomerQuery(invoice?.customerId);
  const { recordPayment, close: closeInvoice } = useInvoiceMutations();
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [payAmount, setPayAmount] = useState<number | ''>('');
  const [printingType, setPrintingType] = useState<'bill' | 'gatepass' | 'both' | null>(null);

  const handlePrint = async (type: 'bill' | 'gatepass' | 'both') => {
    if (!invoice || printingType) return;

    setPrintingType(type);

    try {
      const receipts = buildInvoiceReceiptHtml(type, {
        shopName: SHOP_NAME,
        shopAddress: safeString(settings?.shopAddress),
        shopPhone: safeString(settings?.shopPhone),
        thankYouMessage: safeString(settings?.thankYouMessage) || 'Thank You for Your Business!',
        invoice,
        customerPhone: customer?.phone,
        customerAddress: customer?.address,
      });

      await printReceiptBatch(receipts);
      toast.success(type === 'both' ? 'Bill and gate pass ready to print' : 'Receipt ready to print');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Print failed';
      toast.error(message);
    } finally {
      setPrintingType(null);
    }
  };

  if (!invoice) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Invoice not found</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate('/invoices')}>Back to Invoices</Button>
      </div>
    );
  }

  const cur = CURRENCY;
  const customerName = getInvoiceCustomerName(invoice);
  const slipLabel = getInvoiceSlipLabel(invoice);
  const remaining = invoice.remainingAmount ?? (invoice.total - (invoice.paidAmount || 0));
  const isClosed = isInvoiceClosed(invoice);

  const handleCloseConfirm = (mode: InvoiceCloseMode, restoreStock: boolean) => {
    closeInvoice.mutate(
      { id: invoice.id, options: { mode, restoreStock } },
      {
        onSuccess: () => {
          toast.success(mode === 'return' ? 'Invoice marked as returned' : 'Invoice voided');
          setCloseDialogOpen(false);
        },
        onError: () => toast.error('Could not close invoice'),
      }
    );
  };

  const handlePayment = () => {
    if (!payAmount || payAmount <= 0) { toast.error('Enter a valid amount'); return; }
    recordPayment.mutate(
      { invoiceId: invoice.id, amount: payAmount },
      {
        onSuccess: () => {
          toast.success(`Payment of ${formatMoney(Number(payAmount))} recorded`);
          setPayAmount('');
          setPayDialogOpen(false);
        },
        onError: () => toast.error('Could not record payment'),
      }
    );
  };

  const statusBadge = () => {
    switch (invoice.status) {
      case 'paid': return <Badge className="bg-success text-success-foreground">Paid</Badge>;
      case 'partial': return <Badge variant="outline" className="border-warning text-warning">Partial</Badge>;
      case 'pending': return <Badge variant="outline" className="border-destructive text-destructive">Pending</Badge>;
      case 'returned': return <Badge variant="outline" className="border-orange-500 text-orange-700 dark:text-orange-300">Returned</Badge>;
      case 'cancelled': return <Badge variant="destructive">Voided</Badge>;
    }
  };

  return (
    <div className="max-w-2xl mx-auto pb-16 lg:pb-0 animate-fade-in">
      <div className="flex items-center justify-between mb-4 no-print">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="w-5 h-5" /></Button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-heading font-bold">Invoice</h1>
              {statusBadge()}
              {isInvoiceEdited(invoice) && (
                <Badge
                  variant="outline"
                  className="border-sky-400 text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/30">
                  Edited
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {slipLabel ? `${slipLabel} · ` : ''}
              {invoice.invoiceNumber} · {customerName}
            </p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          {!isClosed && (
            <Button size="sm" variant="outline" asChild>
              <Link to={`/invoices/${invoice.id}/edit`}>
                <Pencil className="w-4 h-4 mr-1" />
                Edit
              </Link>
            </Button>
          )}
          {!isClosed && remaining > 0 && (
            <Button size="sm" variant="outline" onClick={() => setPayDialogOpen(true)}>
              <Wallet className="w-4 h-4 mr-1" />Pay
            </Button>
          )}
          {!isClosed && (
            <Button size="sm" variant="outline" className="text-destructive border-destructive/30" onClick={() => setCloseDialogOpen(true)}>
              <Trash2 className="w-4 h-4 mr-1" />Close
            </Button>
          )}
          <Button size="sm" variant="outline" disabled={Boolean(printingType)} onClick={() => handlePrint('bill')}>
            {printingType === 'bill' ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <FileText className="w-4 h-4 mr-1" />}
            Bill
          </Button>
          <Button size="sm" variant="outline" disabled={Boolean(printingType)} onClick={() => handlePrint('gatepass')}>
            {printingType === 'gatepass' ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <ClipboardList className="w-4 h-4 mr-1" />}
            Gate Pass
          </Button>
          <Button size="sm" disabled={Boolean(printingType)} onClick={() => handlePrint('both')}>
            {printingType === 'both' ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Printer className="w-4 h-4 mr-1" />}
            Print Both
          </Button>
        </div>
      </div>

      {isClosed && (
        <div className="mb-4 p-3 rounded-lg bg-muted/50 border text-sm space-y-1 no-print">
          <p className="font-medium">
            {invoice.status === 'returned' ? 'This order was returned by the customer.' : 'This invoice was voided.'}
          </p>
          {invoice.closureNote && (
            <p className="text-muted-foreground text-xs">{invoice.closureNote}</p>
          )}
          {invoice.closedAt && (
            <p className="text-muted-foreground text-xs">
              Closed on {format(new Date(invoice.closedAt), 'dd MMM yyyy')}
              {invoice.stockRestoredOnClose ? ' · Stock was restored to containers' : ' · Stock was not changed'}
            </p>
          )}
        </div>
      )}

      <Card className="print-area">
        <CardContent className="p-6 sm:p-8 space-y-6">
          {/* Header */}
          <div className="flex justify-between items-start border-b pb-4">
            <div>
              <h2 className="text-xl font-heading font-bold">{SHOP_NAME}</h2>
              {settings?.shopAddress ? <p className="text-sm text-muted-foreground">{settings.shopAddress}</p> : null}
              {settings?.shopPhone ? <p className="text-sm text-muted-foreground">{settings.shopPhone}</p> : null}
            </div>
            <div className="text-right">
              <div className="flex items-center justify-end gap-2 flex-wrap">
                <div className="text-right">
                  {slipLabel && (
                    <p className="text-sm font-heading font-semibold">{slipLabel}</p>
                  )}
                  <p className="font-heading font-bold text-lg">{invoice.invoiceNumber}</p>
                  <p className="text-sm font-medium">{customerName}</p>
                </div>
                {invoice.historical && (
                  <Badge variant="outline" className="text-xs border-amber-500 text-amber-700 dark:text-amber-300">
                    Old record
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">{format(new Date(invoice.createdAt), 'dd MMM yyyy')}</p>
            </div>
          </div>

          {/* Customer */}
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Bill To</p>
            <p className="font-heading font-semibold">{customerName}</p>
            {customer?.phone && <p className="text-sm text-muted-foreground">{customer.phone}</p>}
            {customer?.address && <p className="text-sm text-muted-foreground">{customer.address}</p>}
          </div>

          {/* Items Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 font-heading">Product</th>
                  <th className="text-right py-2 font-heading">Rate</th>
                  <th className="text-right py-2 font-heading">Qty</th>
                  <th className="text-right py-2 font-heading">Total</th>
                </tr>
              </thead>
              <tbody>
                {invoice.items.map((item, i) => (
                  <tr key={i} className="border-b border-dashed">
                    <td className="py-2">{lineItemDisplayName(item)}</td>
                    <td className="text-right py-2">
                      {formatMoney(item.appliedPrice || item.pricePerLiter)}
                      <span className="text-xs text-muted-foreground ml-1">
                        {formatProductPriceSuffix(item)}
                      </span>
                      {item.appliedPrice && item.appliedPrice !== item.pricePerLiter && (
                        <span className="text-xs text-muted-foreground line-through ml-1">{formatMoney(item.pricePerLiter)}</span>
                      )}
                    </td>
                    <td className="text-right py-2">{formatLineItemQuantityWithUnit(item)}</td>
                    <td className="text-right py-2">{formatMoney(item.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="border-t pt-4 space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatMoney(invoice.subtotal)}</span></div>
            {invoice.discount > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Discount</span>
                <span>-{formatMoney(getInvoiceDiscountAmount(invoice))}</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-heading font-bold pt-2 border-t">
              <span>Total</span><span className="text-primary">{formatMoney(invoice.total)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Paid</span>
              <span className="text-success font-medium">{formatMoney(invoice.paidAmount || 0)}</span>
            </div>
            {remaining > 0 && !isClosed && (
              <div className="flex justify-between text-sm font-medium text-destructive">
                <span>Remaining</span><span>{formatMoney(remaining)}</span>
              </div>
            )}
          </div>

          {/* Payment Method */}
          <div className="text-sm">
            <span className="text-muted-foreground">Payment: </span>
            <span className="capitalize font-medium">{invoice.paymentMethod}</span>
          </div>

          {/* Footer */}
          {settings?.thankYouMessage ? (
            <p className="text-center text-sm text-muted-foreground pt-4 border-t italic">{settings.thankYouMessage}</p>
          ) : null}
        </CardContent>
      </Card>

      {/* Pay Dialog */}
      <Dialog open={payDialogOpen} onOpenChange={setPayDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-heading">Record Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 rounded-lg bg-muted/50 text-sm">
              Remaining: <strong className="text-destructive">{formatMoney(remaining)}</strong>
            </div>
            <div>
              <FormLabel required>Amount ({cur})</FormLabel>
              <Input type="number" min="0" value={payAmount} onChange={e => setPayAmount(e.target.value === '' ? '' : Number(e.target.value))} autoFocus />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setPayDialogOpen(false)}>Cancel</Button>
              <Button onClick={handlePayment}>Record Payment</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <InvoiceCloseDialog
        open={closeDialogOpen}
        onOpenChange={setCloseDialogOpen}
        invoice={invoice}
        onConfirm={handleCloseConfirm}
        isLoading={closeInvoice.isPending}
      />
    </div>
  );
}

