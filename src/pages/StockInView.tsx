import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Printer, Wallet, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SHOP_NAME } from '@/lib/shop';
import { CURRENCY, formatMoney } from '@/lib/currency';
import { useSettingsQuery, useStockPurchaseQuery, useSupplierQuery } from '@/hooks/useShopData';
import { useStockPurchaseMutations } from '@/hooks/useShopMutations';
import { safeString } from '@/lib/query/safe';
import { format } from 'date-fns';
import { toast } from 'sonner';

export default function StockInView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: purchase } = useStockPurchaseQuery(id);
  const { data: settings } = useSettingsQuery();
  const { data: supplier } = useSupplierQuery(purchase?.supplierId);
  const { recordPayment } = useStockPurchaseMutations();
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [payAmount, setPayAmount] = useState<number | ''>('');

  if (!purchase) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Purchase slip not found</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate('/stock-in')}>Back to Stock In</Button>
      </div>
    );
  }

  const cur = CURRENCY;
  const remaining = purchase.remainingAmount ?? (purchase.total - (purchase.paidAmount || 0));

  const handlePrint = () => {
    const shopName = SHOP_NAME;
    const shopAddress = safeString(settings?.shopAddress);
    const shopPhone = safeString(settings?.shopPhone);
    const nowStr = new Date().toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
      + ' ' + new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true });

    const vehicleLines = [
      purchase.vehicleNumber ? `<p><strong>Vehicle No:</strong> ${purchase.vehicleNumber}</p>` : '',
      purchase.vehicleDriver ? `<p><strong>Driver:</strong> ${purchase.vehicleDriver}</p>` : '',
      purchase.vehicleType ? `<p><strong>Type:</strong> ${purchase.vehicleType}</p>` : '',
    ].join('');

    const styles = `
      <style>
        @page { margin: 0; }
        body { font-family: Arial, sans-serif; margin: 0; padding: 0; text-align: center; }
        .receipt-container { max-width: 290px; width: 100%; margin: 10px auto; padding: 20px 40px; border: 1px dashed #000; line-height: 1.5; }
        .header h2 { margin: 0; font-size: 22px; font-weight: 900; }
        .header p, .footer p { margin: 0; font-size: 12px; }
        .info p { font-size: 11px; margin: 2px 0; display: flex; justify-content: space-between; }
        .products-table table { width: 100%; border-collapse: collapse; margin: 4px 0; }
        .products-table th, .products-table td { padding: 3px; text-align: left; border: 1px solid #000; font-size: 11px; }
        .totals p { font-size: 11px; margin: 2px 0; display: flex; justify-content: space-between; }
        hr { border: none; border-top: 1px dashed #000; margin: 5px 0; }
        strong { font-size: 11px; }
      </style>
    `;

    const content = `
      <div class="receipt-container">
        <div class="header">
          <h2>${shopName}</h2>
          ${shopAddress ? `<p style="max-width:70%;margin:auto;line-height:14px">${shopAddress}</p>` : ''}
          ${shopPhone ? `<p style="margin-top:4px">Tel: ${shopPhone}</p>` : ''}
          <div style="width:100%;display:flex;justify-content:space-between;align-items:center;margin-top:6px">
            <p><strong>Purchase Slip</strong></p>
            <p><strong>Date:</strong> ${nowStr}</p>
          </div>
        </div>
        <hr />
        <div class="info">
          <p style="text-transform:uppercase"><strong>Slip No:</strong> ${purchase.slipNumber}</p>
          <p><strong>Supplier:</strong> ${purchase.supplierName}</p>
          ${supplier?.phone ? `<p><strong>Phone:</strong> ${supplier.phone}</p>` : ''}
          ${vehicleLines}
        </div>
        <div class="products-table">
          <table>
            <thead>
              <tr><th>Item</th><th>Category</th><th>Qty</th><th>Rate</th><th>Total</th></tr>
            </thead>
            <tbody>
              ${purchase.items.map(item => `
                <tr>
                  <td>${item.productName}</td>
                  <td>${item.category}</td>
                  <td>${item.quantity.toLocaleString()} L</td>
                  <td>${formatMoney(item.pricePerLiter, 0)}</td>
                  <td>${formatMoney(item.total, 0)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        <div class="totals">
          <p><strong>Total:</strong> ${formatMoney(purchase.total, 0)}</p>
          <p><strong>Paid:</strong> ${formatMoney(purchase.paidAmount || 0, 0)}</p>
          <p><strong>Pending:</strong> ${formatMoney(remaining, 0)}</p>
        </div>
        ${purchase.note ? `<p style="font-size:11px;margin-top:6px"><strong>Note:</strong> ${purchase.note}</p>` : ''}
        <hr />
        <div class="footer"><p>Received oil into store inventory. Supplier copy.</p></div>
      </div>
    `;

    const win = window.open('', '_blank');
    if (!win) return;
    win.document.open();
    win.document.write(styles + content);
    win.document.close();
    win.print();
    win.close();
  };

  const handlePayment = () => {
    if (!payAmount || payAmount <= 0) { toast.error('Enter a valid amount'); return; }
    recordPayment.mutate(
      { purchaseId: purchase.id, amount: payAmount },
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
    switch (purchase.status) {
      case 'paid': return <Badge className="bg-success text-success-foreground">Paid</Badge>;
      case 'partial': return <Badge variant="outline" className="border-warning text-warning">Partial</Badge>;
      case 'pending': return <Badge variant="outline" className="border-destructive text-destructive">Pending</Badge>;
    }
  };

  return (
    <div className="max-w-2xl mx-auto pb-16 lg:pb-0 animate-fade-in">
      <div className="flex items-center justify-between mb-4 no-print">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="w-5 h-5" /></Button>
          <h1 className="text-2xl font-heading font-bold">Purchase Slip</h1>
          {statusBadge()}
        </div>
        <div className="flex gap-2">
          {remaining > 0 && (
            <Button size="sm" variant="outline" onClick={() => setPayDialogOpen(true)}>
              <Wallet className="w-4 h-4 mr-1" />Pay Supplier
            </Button>
          )}
          <Button size="sm" onClick={handlePrint}>
            <Printer className="w-4 h-4 mr-1" />Print Slip
          </Button>
        </div>
      </div>

      <Card className="print-area">
        <CardContent className="p-6 sm:p-8 space-y-6">
          <div className="flex justify-between items-start border-b pb-4">
            <div>
              <h2 className="text-xl font-heading font-bold">{SHOP_NAME}</h2>
              {settings?.shopAddress ? <p className="text-sm text-muted-foreground">{settings.shopAddress}</p> : null}
              {settings?.shopPhone ? <p className="text-sm text-muted-foreground">{settings.shopPhone}</p> : null}
            </div>
            <div className="text-right">
              <p className="font-heading font-bold text-lg">{purchase.slipNumber}</p>
              <p className="text-sm text-muted-foreground">{format(new Date(purchase.createdAt), 'dd MMM yyyy')}</p>
            </div>
          </div>

          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Supplier / Dealer</p>
            <p className="font-heading font-semibold flex items-center gap-2">
              <Truck className="w-4 h-4 text-primary" />
              {purchase.supplierName}
            </p>
            {supplier?.phone && <p className="text-sm text-muted-foreground">{supplier.phone}</p>}
            {supplier?.address && <p className="text-sm text-muted-foreground">{supplier.address}</p>}
          </div>

          {(purchase.vehicleNumber || purchase.vehicleDriver || purchase.vehicleType) && (
            <div className="p-3 rounded-lg bg-muted/30 border text-sm space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase">Delivery vehicle</p>
              {purchase.vehicleNumber && <p><span className="text-muted-foreground">No:</span> {purchase.vehicleNumber}</p>}
              {purchase.vehicleDriver && <p><span className="text-muted-foreground">Driver:</span> {purchase.vehicleDriver}</p>}
              {purchase.vehicleType && <p><span className="text-muted-foreground">Type:</span> {purchase.vehicleType}</p>}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 font-heading">Oil / Product</th>
                  <th className="text-left py-2 font-heading">Category</th>
                  <th className="text-right py-2 font-heading">Qty (L)</th>
                  <th className="text-right py-2 font-heading">Rate/L</th>
                  <th className="text-right py-2 font-heading">Total</th>
                </tr>
              </thead>
              <tbody>
                {purchase.items.map((item, i) => (
                  <tr key={i} className="border-b border-dashed">
                    <td className="py-2">{item.productName}</td>
                    <td className="py-2 text-muted-foreground">{item.category}</td>
                    <td className="text-right py-2">{item.quantity}</td>
                    <td className="text-right py-2">{formatMoney(item.pricePerLiter)}</td>
                    <td className="text-right py-2">{formatMoney(item.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="border-t pt-4 space-y-1 text-sm">
            <div className="flex justify-between text-lg font-heading font-bold pt-2">
              <span>Total</span><span className="text-primary">{formatMoney(purchase.total)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Paid to supplier</span>
              <span className="text-success font-medium">{formatMoney(purchase.paidAmount || 0)}</span>
            </div>
            {remaining > 0 && (
              <div className="flex justify-between text-sm font-medium text-destructive">
                <span>Pending</span><span>{formatMoney(remaining)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm pt-2">
              <span className="text-muted-foreground">Payment</span>
              <span className="capitalize font-medium">{purchase.paymentMethod}</span>
            </div>
          </div>

          {purchase.note && (
            <p className="text-sm text-muted-foreground border-t pt-4"><strong>Note:</strong> {purchase.note}</p>
          )}

          <p className="text-center text-xs text-muted-foreground pt-2 border-t">
            Stock added to store containers. Give printed slip to supplier.
          </p>
        </CardContent>
      </Card>

      <Dialog open={payDialogOpen} onOpenChange={setPayDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-heading">Pay Supplier</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 rounded-lg bg-muted/50 text-sm">
              Pending: <strong className="text-destructive">{formatMoney(remaining)}</strong>
            </div>
            <div>
              <Label>Amount ({cur})</Label>
              <Input type="number" min="0" value={payAmount} onChange={e => setPayAmount(e.target.value === '' ? '' : Number(e.target.value))} autoFocus />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setPayDialogOpen(false)}>Cancel</Button>
              <Button onClick={handlePayment}>Record Payment</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}


