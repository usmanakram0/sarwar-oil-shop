import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search, Eye, Trash2, Truck, History } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { formatMoney } from '@/lib/currency';
import { useStockPurchasesList } from '@/hooks/useShopData';
import { useStockPurchaseMutations } from '@/hooks/useShopMutations';
import { safeNumber } from '@/lib/query/safe';
import { format } from 'date-fns';
import { toast } from 'sonner';
import ConfirmDeleteDialog from '@/components/ConfirmDeleteDialog';
import type { StockPurchase } from '@/lib/storage';

export default function StockIn() {
  const { purchases } = useStockPurchasesList();
  const { remove: deletePurchase } = useStockPurchaseMutations();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [deleteTarget, setDeleteTarget] = useState<StockPurchase | null>(null);

  const filtered = useMemo(() => {
    return [...purchases]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .filter(p => {
        const matchSearch = p.slipNumber.toLowerCase().includes(search.toLowerCase()) ||
          p.supplierName.toLowerCase().includes(search.toLowerCase()) ||
          (p.vehicleNumber || '').toLowerCase().includes(search.toLowerCase());
        const matchStatus = statusFilter === 'all' || p.status === statusFilter;
        return matchSearch && matchStatus;
      });
  }, [purchases, search, statusFilter]);

  const confirmDelete = () => {
    if (!deleteTarget) return;
    deletePurchase.mutate(deleteTarget.id, {
      onSuccess: () => {
        toast.success('Purchase deleted');
        setDeleteTarget(null);
      },
      onError: () => toast.error('Could not delete purchase'),
    });
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case 'paid': return <Badge className="bg-success text-success-foreground text-xs">Paid</Badge>;
      case 'partial': return <Badge variant="outline" className="border-warning text-warning text-xs">Partial</Badge>;
      case 'pending': return <Badge variant="outline" className="border-destructive text-destructive text-xs">Pending</Badge>;
      default: return null;
    }
  };

  return (
    <div className="space-y-4 pb-16 lg:pb-0 animate-fade-in">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-2xl font-heading font-bold">Stock In</h1>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" asChild>
            <Link to="/stock-in/new" state={{ historical: true }}>
              <History className="w-4 h-4 mr-1" />Add Old Record
            </Link>
          </Button>
          <Button size="sm" asChild>
            <Link to="/stock-in/new"><Plus className="w-4 h-4 mr-1" />New Purchase</Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search slip, supplier, vehicle..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="partial">Partial</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No purchases found</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(pur => {
            const remaining = pur.remainingAmount ?? (pur.total - (pur.paidAmount || 0));
            const qtyTotal = pur.items.reduce((s, i) => s + i.quantity, 0);
            return (
              <Card key={pur.id} className="group hover:shadow-md transition-shadow">
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Truck className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-heading font-semibold">{pur.slipNumber}</p>
                          {pur.historical && (
                            <Badge variant="outline" className="text-xs border-amber-500 text-amber-700 dark:text-amber-300">
                              Old record
                            </Badge>
                          )}
                          {statusBadge(pur.status)}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {pur.supplierName} · {qtyTotal}L · {format(new Date(pur.createdAt), 'dd MMM yyyy')}{pur.vehicleNumber ? ` · ${pur.vehicleNumber}` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <span className="text-lg font-heading font-bold">{formatMoney(pur.total)}</span>
                        {remaining > 0 && (
                          <p className="text-xs text-destructive">Due: {formatMoney(remaining)}</p>
                        )}
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                          <Link to={`/stock-in/${pur.id}`}><Eye className="w-4 h-4" /></Link>
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteTarget(pur)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={`Delete purchase ${deleteTarget?.slipNumber}?`}
        description="This will permanently remove the purchase record and reduce stock from your containers. This action cannot be undone."
        onConfirm={confirmDelete}
        isLoading={deletePurchase.isPending}
      />
    </div>
  );
}

