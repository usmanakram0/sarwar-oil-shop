import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search, Eye, Trash2, FileText, History } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import ListPagination from '@/components/ui/ListPagination';
import { formatMoney } from '@/lib/currency';
import { isInvoiceClosed } from '@/lib/invoiceLifecycle';
import { useInvoicesList } from '@/hooks/useShopData';
import { useInvoiceMutations } from '@/hooks/useShopMutations';
import { usePagination } from '@/hooks/usePagination';
import { format } from 'date-fns';
import { toast } from 'sonner';
import InvoiceCloseDialog from '@/components/InvoiceCloseDialog';
import type { Invoice } from '@/lib/storage';
import type { InvoiceCloseMode } from '@/lib/invoiceLifecycle';

export default function Invoices() {
  const { invoices } = useInvoicesList();
  const { close: closeInvoice } = useInvoiceMutations();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [closeTarget, setCloseTarget] = useState<Invoice | null>(null);

  const filtered = useMemo(() => {
    return [...invoices]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .filter(i => {
        const matchSearch = i.invoiceNumber.toLowerCase().includes(search.toLowerCase()) ||
          i.customerName.toLowerCase().includes(search.toLowerCase());
        const matchStatus = statusFilter === 'all' || i.status === statusFilter;
        return matchSearch && matchStatus;
      });
  }, [invoices, search, statusFilter]);

  const {
    paginatedItems: paginatedInvoices,
    page,
    setPage,
    pageSize,
    setPageSize,
    totalItems,
    totalPages,
  } = usePagination(filtered, [search, statusFilter]);

  const handleCloseConfirm = (mode: InvoiceCloseMode, restoreStock: boolean) => {
    if (!closeTarget) return;
    closeInvoice.mutate(
      { id: closeTarget.id, options: { mode, restoreStock } },
      {
        onSuccess: () => {
          toast.success(
            mode === 'return'
              ? 'Invoice marked as returned'
              : 'Invoice voided'
          );
          setCloseTarget(null);
        },
        onError: () => toast.error('Could not close invoice'),
      }
    );
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case 'paid': return <Badge className="bg-success text-success-foreground text-xs">Paid</Badge>;
      case 'partial': return <Badge variant="outline" className="border-warning text-warning text-xs">Partial</Badge>;
      case 'pending': return <Badge variant="outline" className="border-destructive text-destructive text-xs">Pending</Badge>;
      case 'returned': return <Badge variant="outline" className="border-orange-500 text-orange-700 dark:text-orange-300 text-xs">Returned</Badge>;
      case 'cancelled': return <Badge variant="destructive" className="text-xs">Voided</Badge>;
      default: return null;
    }
  };

  return (
    <div className="space-y-4 pb-16 lg:pb-0 animate-fade-in">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-2xl font-heading font-bold">Invoices</h1>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" asChild>
            <Link to="/invoices/new" state={{ historical: true }}>
              <History className="w-4 h-4 mr-1" />Add Old Order
            </Link>
          </Button>
          <Button size="sm" asChild>
            <Link to="/invoices/new"><Plus className="w-4 h-4 mr-1" />New Invoice</Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search invoices..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="partial">Partial</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="returned">Returned</SelectItem>
            <SelectItem value="cancelled">Voided</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No invoices found</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {paginatedInvoices.map(inv => {
            const remaining = inv.remainingAmount ?? (inv.total - (inv.paidAmount || 0));
            const isClosed = isInvoiceClosed(inv);
            return (
              <Card key={inv.id} className="group hover:shadow-md transition-shadow">
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <FileText className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-heading font-semibold">{inv.invoiceNumber}</p>
                          {inv.historical && (
                            <Badge variant="outline" className="text-xs border-amber-500 text-amber-700 dark:text-amber-300">
                              Old record
                            </Badge>
                          )}
                          {statusBadge(inv.status)}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {inv.customerName} · {format(new Date(inv.createdAt), 'dd MMM yyyy')} · {inv.paymentMethod}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <span className="text-lg font-heading font-bold">{formatMoney(inv.total)}</span>
                        {!isClosed && remaining > 0 && (
                          <p className="text-xs text-destructive">Due: {formatMoney(remaining)}</p>
                        )}
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                          <Link to={`/invoices/${inv.id}`}><Eye className="w-4 h-4" /></Link>
                        </Button>
                        {!isClosed && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            onClick={() => setCloseTarget(inv)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          <ListPagination
            page={page}
            totalPages={totalPages}
            totalItems={totalItems}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </div>
      )}

      <InvoiceCloseDialog
        open={Boolean(closeTarget)}
        onOpenChange={(open) => !open && setCloseTarget(null)}
        invoice={closeTarget}
        onConfirm={handleCloseConfirm}
        isLoading={closeInvoice.isPending}
      />
    </div>
  );
}

