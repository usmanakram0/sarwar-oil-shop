import { useMemo, useState, type ReactNode } from "react";
import { Droplets, Package } from "lucide-react";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Invoice } from "@/lib/storage";
import {
  formatCartons,
  formatLiters,
  formatSaleQuantity,
  getTodayCartonProductSales,
  getTodayOilProductSales,
  getTodayTotalCartons,
  getTodayTotalLiters,
  type TodayProductSale,
} from "@/lib/todaySales";

interface TodaySalesBreakdownProps {
  invoices: Invoice[];
}

interface SalesBreakdownDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  totalLabel: string;
  products: TodayProductSale[];
  emptyMessage: string;
}

function SalesBreakdownDialog({
  open,
  onOpenChange,
  title,
  totalLabel,
  products,
  emptyMessage,
}: SalesBreakdownDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">{title}</DialogTitle>
          <DialogDescription>
            {format(new Date(), "EEEE, dd MMM yyyy")} · 12:00 AM – 11:59 PM
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border bg-muted/30 px-4 py-3">
          <p className="text-xs text-muted-foreground">Total sold today</p>
          <p className="text-lg font-heading font-bold">{totalLabel}</p>
        </div>

        {products.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            {emptyMessage}
          </p>
        ) : (
          <ScrollArea className="max-h-[50vh] pr-3">
            <div className="space-y-2">
              {products.map((product) => (
                <div
                  key={`${product.productId}:${product.productType}`}
                  className="flex items-center justify-between gap-4 rounded-lg bg-muted/40 px-4 py-3">
                  <p className="text-sm font-medium">{product.productName}</p>
                  <p className="text-sm font-heading font-semibold shrink-0">
                    {formatSaleQuantity(product)}
                  </p>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface SalesSummaryCardProps {
  icon: ReactNode;
  label: string;
  value: string;
  onClick: () => void;
}

function SalesSummaryCard({
  icon,
  label,
  value,
  onClick,
}: SalesSummaryCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left transition-transform duration-75 active:scale-[0.99]">
      <Card className="h-full hover:shadow-md transition-shadow duration-200 cursor-pointer border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
        <CardContent className="pt-5 pb-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                {icon}
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-xl font-heading font-bold truncate">{value}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground shrink-0 hidden sm:block">
              Tap for breakdown
            </p>
          </div>
        </CardContent>
      </Card>
    </button>
  );
}

export default function TodaySalesBreakdown({
  invoices,
}: TodaySalesBreakdownProps) {
  const [oilOpen, setOilOpen] = useState(false);
  const [cartonOpen, setCartonOpen] = useState(false);

  const todayOilSales = useMemo(
    () => getTodayOilProductSales(invoices),
    [invoices],
  );
  const todayCartonSales = useMemo(
    () => getTodayCartonProductSales(invoices),
    [invoices],
  );
  const todayTotalLiters = useMemo(
    () => getTodayTotalLiters(invoices),
    [invoices],
  );
  const todayTotalCartons = useMemo(
    () => getTodayTotalCartons(invoices),
    [invoices],
  );

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <SalesSummaryCard
          icon={<Droplets className="w-5 h-5 text-primary" />}
          label="Oil Sale Today"
          value={formatLiters(todayTotalLiters)}
          onClick={() => setOilOpen(true)}
        />
        <SalesSummaryCard
          icon={<Package className="w-5 h-5 text-primary" />}
          label="Carton Sale Today"
          value={formatCartons(todayTotalCartons)}
          onClick={() => setCartonOpen(true)}
        />
      </div>

      <SalesBreakdownDialog
        open={oilOpen}
        onOpenChange={setOilOpen}
        title="Today's Oil Sales"
        totalLabel={formatLiters(todayTotalLiters)}
        products={todayOilSales}
        emptyMessage="No oil sales recorded today"
      />

      <SalesBreakdownDialog
        open={cartonOpen}
        onOpenChange={setCartonOpen}
        title="Today's Carton Sales"
        totalLabel={formatCartons(todayTotalCartons)}
        products={todayCartonSales}
        emptyMessage="No carton sales recorded today"
      />
    </>
  );
}
