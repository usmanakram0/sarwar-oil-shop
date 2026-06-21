import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText } from 'lucide-react';
import { format } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { Invoice } from '@/lib/storage';
import { formatMoneyWhole } from '@/lib/currency';
import {
  formatInvoiceDailySlip,
  getTodaySlipInvoiceCount,
  getTodaySlipInvoices,
} from '@/lib/dailySlipNumber';

interface TodayInvoiceSlipsProps {
  invoices: Invoice[];
}

export default function TodayInvoiceSlips({ invoices }: TodayInvoiceSlipsProps) {
  const [open, setOpen] = useState(false);

  const todayInvoices = useMemo(
    () => getTodaySlipInvoices(invoices),
    [invoices],
  );
  const todayCount = useMemo(
    () => getTodaySlipInvoiceCount(invoices),
    [invoices],
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full text-left transition-transform duration-75 active:scale-[0.99]">
        <Card className="h-full hover:shadow-md transition-shadow duration-200 cursor-pointer border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
          <CardContent className="pt-5 pb-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">
                    Today&apos;s Invoices
                  </p>
                  <p className="text-xl font-heading font-bold truncate">
                    {todayCount} slip{todayCount === 1 ? '' : 's'}
                  </p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground shrink-0 hidden sm:block">
                Tap for list
              </p>
            </div>
          </CardContent>
        </Card>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">
              Today&apos;s Invoice Slips
            </DialogTitle>
            <DialogDescription>
              {format(new Date(), 'EEEE, dd MMM yyyy')} · Daily counter resets
              at midnight
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border bg-muted/30 px-4 py-3">
            <p className="text-xs text-muted-foreground">Total slips today</p>
            <p className="text-lg font-heading font-bold">{todayCount}</p>
          </div>

          {todayInvoices.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No invoices created today
            </p>
          ) : (
            <ScrollArea className="max-h-[50vh] pr-3">
              <div className="space-y-2">
                {todayInvoices.map((invoice) => {
                  const slipLabel = formatInvoiceDailySlip(invoice, invoices);
                  return (
                    <Link
                      key={invoice.id}
                      to={`/invoices/${invoice.id}`}
                      onClick={() => setOpen(false)}
                      className="flex items-center justify-between gap-4 rounded-lg bg-muted/40 px-4 py-3 hover:bg-muted transition-colors">
                      <div className="min-w-0">
                        <p className="text-sm font-heading font-semibold">
                          {slipLabel}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {invoice.customerName} · {invoice.invoiceNumber}
                        </p>
                      </div>
                      <p className="text-sm font-heading font-semibold shrink-0">
                        {formatMoneyWhole(invoice.total)}
                      </p>
                    </Link>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
