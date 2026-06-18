import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  Plus,
  FileText,
  Package,
  TrendingUp,
  AlertTriangle,
  DollarSign,
  BookOpen,
  Users,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  invoiceStorage,
  productStorage,
  customerStorage,
  settingsStorage,
} from "@/lib/storage";
import { formatMoney, formatMoneyWhole } from "@/lib/currency";
import { isLowStockAlert } from "@/lib/inventory";
import { formatStockShort } from "@/lib/productTypes";
import { format, isToday, isThisWeek, isThisMonth } from "date-fns";
import { isActiveSale } from "@/lib/invoiceLifecycle";
import TodaySalesBreakdown from "@/components/dashboard/TodaySalesBreakdown";

export default function Dashboard() {
  const settings = settingsStorage.get();
  const invoices = invoiceStorage.getAll();
  const products = productStorage.getAll();
  const customers = customerStorage.getAll();

  const stats = useMemo(() => {
    const todaySales = invoices
      .filter((i) => isToday(new Date(i.createdAt)) && isActiveSale(i))
      .reduce((sum, i) => sum + i.total, 0);
    const weekSales = invoices
      .filter(
        (i) => isThisWeek(new Date(i.createdAt)) && isActiveSale(i),
      )
      .reduce((sum, i) => sum + i.total, 0);
    const monthSales = invoices
      .filter(
        (i) => isThisMonth(new Date(i.createdAt)) && isActiveSale(i),
      )
      .reduce((sum, i) => sum + i.total, 0);
    const lowStockProducts = products.filter((p) => isLowStockAlert(p));
    const pendingInvoices = invoices.filter(
      (i) => i.status === "pending" || i.status === "partial",
    );
    const totalReceivable = pendingInvoices.reduce(
      (s, i) => s + (i.remainingAmount || i.total - (i.paidAmount || 0)),
      0,
    );
    return {
      todaySales,
      weekSales,
      monthSales,
      lowStockProducts,
      pendingInvoices,
      totalReceivable,
    };
  }, [invoices, products]);

  const recentInvoices = useMemo(
    () =>
      [...invoices]
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        )
        .slice(0, 5),
    [invoices],
  );

  return (
    <div className="space-y-6 pb-16 lg:pb-0 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-heading font-bold">Dashboard</h1>
        <div className="flex gap-2">
          <Button asChild size="sm">
            <Link to="/invoices/new">
              <Plus className="w-4 h-4 mr-1" />
              New Invoice
            </Link>
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Today</p>
                <p className="text-xl font-heading font-bold">
                  {formatMoneyWhole(stats.todaySales)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">This Month</p>
                <p className="text-xl font-heading font-bold">
                  {formatMoneyWhole(stats.monthSales)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center">
                <BookOpen className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Receivable</p>
                <p className="text-xl font-heading font-bold text-destructive">
                  {formatMoneyWhole(stats.totalReceivable)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-warning/10 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-warning" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Low Stock</p>
                <p className="text-xl font-heading font-bold">
                  {stats.lowStockProducts.length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <TodaySalesBreakdown invoices={invoices} />

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="bg-gradient-to-br from-primary/5 to-transparent">
          <CardContent className="pt-4 pb-4 text-center">
            <p className="text-2xl font-heading font-bold">{products.length}</p>
            <p className="text-xs text-muted-foreground">Products</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-accent/5 to-transparent">
          <CardContent className="pt-4 pb-4 text-center">
            <p className="text-2xl font-heading font-bold">
              {customers.length}
            </p>
            <p className="text-xs text-muted-foreground">Customers</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-success/5 to-transparent">
          <CardContent className="pt-4 pb-4 text-center">
            <p className="text-2xl font-heading font-bold">{invoices.length}</p>
            <p className="text-xs text-muted-foreground">Invoices</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Recent Invoices */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-heading">
                Recent Invoices
              </CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/invoices" className="text-xs">
                  View all
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {recentInvoices.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No invoices yet
              </p>
            ) : (
              <div className="space-y-2">
                {recentInvoices.map((inv) => {
                  const remaining =
                    inv.remainingAmount ?? inv.total - (inv.paidAmount || 0);
                  return (
                    <Link
                      key={inv.id}
                      to={`/invoices/${inv.id}`}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/40 hover:bg-muted transition-colors">
                      <div>
                        <p className="text-sm font-medium">
                          {inv.invoiceNumber}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {inv.customerName} ·{" "}
                          {format(new Date(inv.createdAt), "dd MMM")}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-heading font-semibold">
                          {formatMoneyWhole(inv.total)}
                        </span>
                        {remaining > 0 && (
                          <p className="text-xs text-destructive">
                            Due: {formatMoneyWhole(remaining)}
                          </p>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Low Stock & Pending */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-heading">
                Low Stock Alerts
              </CardTitle>
            </CardHeader>
            <CardContent>
              {stats.lowStockProducts.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  All products well-stocked
                </p>
              ) : (
                <div className="space-y-2">
                  {stats.lowStockProducts.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-destructive/5">
                      <div>
                        <p className="text-sm font-medium">{p.name}</p>
                      </div>
                      <Badge
                        variant="outline"
                        className="border-destructive text-destructive">
                        {formatStockShort(p)}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {stats.pendingInvoices.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-heading">
                    Pending Payments
                  </CardTitle>
                  <Badge
                    variant="outline"
                    className="border-destructive text-destructive">
                    {stats.pendingInvoices.length}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {stats.pendingInvoices.slice(0, 4).map((inv) => (
                    <Link
                      key={inv.id}
                      to={`/invoices/${inv.id}`}
                      className="flex items-center justify-between p-3 rounded-lg bg-warning/5 hover:bg-warning/10 transition-colors">
                      <div>
                        <p className="text-sm font-medium">
                          {inv.customerName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {inv.invoiceNumber}
                        </p>
                      </div>
                      <span className="text-sm font-heading font-semibold text-destructive">
                        {formatMoneyWhole(
                          inv.remainingAmount ||
                          inv.total - (inv.paidAmount || 0)
                        )}
                      </span>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
