import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Plus, Trash2, ArrowLeft, Pencil } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import HistoricalEntryFields from '@/components/forms/HistoricalEntryFields';
import { type InvoiceItem } from '@/lib/storage';
import { CURRENCY, formatMoney } from '@/lib/currency';
import {
  useCustomerBalanceQuery,
  useCustomersList,
  useProductsList,
} from '@/hooks/useShopData';
import { useInvoiceMutations } from '@/hooks/useShopMutations';
import { formatDateInputValue, validateOrderDate } from '@/lib/historicalEntry';
import { toast } from 'sonner';

export default function InvoiceCreate() {
  const navigate = useNavigate();
  const location = useLocation();
  const startHistorical = Boolean((location.state as { historical?: boolean } | null)?.historical);

  const { products } = useProductsList();
  const { customers } = useCustomersList();
  const { create: createInvoice } = useInvoiceMutations();

  const [isHistorical, setIsHistorical] = useState(startHistorical);
  const [orderDate, setOrderDate] = useState(formatDateInputValue());
  const [manualInvoiceNumber, setManualInvoiceNumber] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [discount, setDiscount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'credit'>('cash');
  const [paidAmount, setPaidAmount] = useState<number | ''>('');

  const { data: balanceData } = useCustomerBalanceQuery(customerId);
  const customerBalance = customerId ? balanceData ?? null : null;

  const subtotal = items.reduce((sum, i) => sum + i.total, 0);
  const total = subtotal - discount;

  useEffect(() => {
    setDiscount((prev) => (prev > subtotal ? subtotal : prev));
  }, [subtotal]);

  const handleDiscountChange = (value: string) => {
    if (value === '') {
      setDiscount(0);
      return;
    }

    const parsed = Number(value);
    if (Number.isNaN(parsed) || parsed < 0) return;

    setDiscount(Math.min(parsed, subtotal));
  };

  // If customer has advance balance (negative = advance), deduct from total
  const effectiveTotal = useMemo(() => {
    if (!customerBalance) return total;
    // balance > 0 means customer owes, balance < 0 means advance
    if (customerBalance.balance < 0) {
      const advance = Math.abs(customerBalance.balance);
      return Math.max(0, total - advance);
    }
    return total;
  }, [total, customerBalance]);

  const addItem = () => {
    setItems([...items, { productId: '', productName: '', pricePerLiter: 0, appliedPrice: 0, quantity: 1, total: 0 }]);
  };

  const updateItem = (index: number, field: string, value: string | number) => {
    const updated = [...items];
    const item = { ...updated[index] };

    if (field === 'productId') {
      const product = products.find(p => p.id === value);
      if (product) {
        item.productId = product.id;
        item.productName = product.name;
        item.pricePerLiter = product.pricePerLiter;
        item.appliedPrice = product.pricePerLiter;
        item.total = item.quantity * product.pricePerLiter;
      }
    } else if (field === 'quantity') {
      item.quantity = Number(value);
      item.total = item.quantity * item.appliedPrice;
    } else if (field === 'appliedPrice') {
      item.appliedPrice = Number(value);
      item.total = item.quantity * item.appliedPrice;
    }

    updated[index] = item;
    setItems(updated);
  };

  const removeItem = (index: number) => setItems(items.filter((_, i) => i !== index));

  const handleSubmit = () => {
    if (!customerId) { toast.error('Please select a customer'); return; }
    if (items.length === 0) { toast.error('Please add at least one product'); return; }
    const invalidItems = items.filter(i => !i.productId || i.quantity <= 0);
    if (invalidItems.length > 0) { toast.error('Please fill in all product details'); return; }

    if (isHistorical) {
      const dateCheck = validateOrderDate(orderDate);
      if (!dateCheck.valid) {
        toast.error(dateCheck.message || 'Invalid order date');
        return;
      }
    }

    if (!isHistorical) {
      for (const item of items) {
        const product = products.find(p => p.id === item.productId);
        if (product && item.quantity > product.stock) {
          toast.error(`Insufficient stock for ${product.name}. Available: ${product.stock}L`);
          return;
        }
      }
    }

    if (discount > subtotal) {
      toast.error(`Discount cannot exceed bill amount (${formatMoney(subtotal)})`);
      return;
    }

    const paid = Number(paidAmount) || 0;
    const customer = customers.find(c => c.id === customerId);

    let status: 'paid' | 'pending' | 'partial' = 'pending';
    if (paid >= total) status = 'paid';
    else if (paid > 0) status = 'partial';

    createInvoice.mutate(
      {
        invoice: {
          customerId,
          customerName: customer?.name || '',
          items,
          subtotal,
          discount,
          tax: 0,
          total,
          paidAmount: paid,
          remainingAmount: Math.max(0, total - paid),
          paymentMethod,
          status,
        },
        options: isHistorical
          ? {
              orderDate,
              skipStockUpdate: true,
              manualNumber: manualInvoiceNumber.trim() || undefined,
            }
          : undefined,
      },
      {
        onSuccess: () => {
          toast.success(isHistorical ? 'Old order recorded!' : 'Invoice created!');
          navigate('/invoices');
        },
        onError: () => toast.error('Could not save invoice'),
      }
    );
  };

  const cur = CURRENCY;

  return (
    <div className="space-y-4 pb-16 lg:pb-0 animate-fade-in max-w-3xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="w-5 h-5" /></Button>
        <h1 className="text-2xl font-heading font-bold">
          {isHistorical ? 'Add Old Order' : 'New Invoice'}
        </h1>
      </div>

      <HistoricalEntryFields
        enabled={isHistorical}
        onEnabledChange={setIsHistorical}
        orderDate={orderDate}
        onOrderDateChange={setOrderDate}
        showManualNumber
        manualNumber={manualInvoiceNumber}
        onManualNumberChange={setManualInvoiceNumber}
        manualNumberLabel="Old invoice / voucher number"
        manualNumberPlaceholder="e.g. INV-2022-0156"
        description="Enter old written orders from your register. Stock will not be reduced and the ledger will use the date you choose."
      />

      {/* Customer Selection */}
      <Card className="border-l-4 border-l-primary">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-heading">Customer</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Select value={customerId} onValueChange={setCustomerId}>
            <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
            <SelectContent>
              {customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name} {c.phone ? `(${c.phone})` : ''}</SelectItem>)}
            </SelectContent>
          </Select>
          {customerId && (() => {
            const sel = customers.find(c => c.id === customerId);
            return sel ? (
              <div className="p-3 rounded-lg bg-muted/30 border border-border/50 text-sm space-y-1">
                {sel.phone && <p><span className="text-muted-foreground">Phone:</span> <strong>{sel.phone}</strong></p>}
                {sel.address && <p><span className="text-muted-foreground">Address:</span> {sel.address}</p>}
              </div>
            ) : null;
          })()}
          {customerBalance && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <span className="text-sm text-muted-foreground">Balance:</span>
              {customerBalance.balance > 0 ? (
                <Badge variant="outline" className="border-destructive text-destructive">
                  Owes {formatMoney(customerBalance.balance)}
                </Badge>
              ) : customerBalance.balance < 0 ? (
                <Badge variant="outline" className="border-success text-success">
                  Advance {formatMoney(Math.abs(customerBalance.balance))}
                </Badge>
              ) : (
                <Badge variant="outline">Settled</Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Items */}
      <Card className="border-l-4 border-l-accent">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-heading">Products</CardTitle>
          <Button size="sm" variant="outline" onClick={addItem}><Plus className="w-4 h-4 mr-1" />Add</Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {items.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">No products added yet</p>}
          {items.map((item, index) => (
            <div key={index} className="p-3 rounded-lg bg-muted/30 border border-border/50 space-y-2">
              <div className="flex gap-2">
                <div className="flex-1">
                  <Select value={item.productId} onValueChange={v => updateItem(index, 'productId', v)}>
                    <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                    <SelectContent>
                      {products.map(p => <SelectItem key={p.id} value={p.id}>{p.name} ({p.stock}L)</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive shrink-0" onClick={() => removeItem(index)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <Label className="text-xs text-muted-foreground">Price/{cur}</Label>
                  <div className="relative">
                    <Input
                      type="number"
                      step="0.01"
                      value={item.appliedPrice || ''}
                      onChange={e => updateItem(index, 'appliedPrice', e.target.value)}
                      className={item.appliedPrice !== item.pricePerLiter && item.pricePerLiter > 0 ? 'border-warning' : ''}
                    />
                    {item.appliedPrice !== item.pricePerLiter && item.pricePerLiter > 0 && (
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground line-through">
                        {item.pricePerLiter}
                      </span>
                    )}
                  </div>
                </div>
                <div className="w-20">
                  <Label className="text-xs text-muted-foreground">Qty (L)</Label>
                  <Input type="number" min="1" value={item.quantity || ''} onChange={e => updateItem(index, 'quantity', e.target.value)} />
                </div>
                <div className="w-28 text-right">
                  <Label className="text-xs text-muted-foreground">Total</Label>
                  <p className="text-sm font-heading font-bold py-2">{formatMoney(item.total)}</p>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Payment Details */}
      <Card className="border-l-4 border-l-success">
        <CardContent className="pt-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Discount ({cur})</Label>
              <Input
                type="number"
                min="0"
                max={subtotal}
                step="0.01"
                value={discount || ''}
                disabled={subtotal <= 0}
                onChange={(e) => handleDiscountChange(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {subtotal > 0
                  ? `Maximum discount: ${formatMoney(subtotal)}`
                  : 'Add products to apply a discount'}
              </p>
            </div>
            <div>
              <Label>Payment Method</Label>
              <Select value={paymentMethod} onValueChange={v => setPaymentMethod(v as 'cash' | 'card' | 'credit')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="credit">Credit</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Amount Paid Now ({cur})</Label>
            <Input
              type="number"
              min="0"
              placeholder={`Total: ${formatMoney(total)}`}
              value={paidAmount}
              onChange={e => setPaidAmount(e.target.value === '' ? '' : Number(e.target.value))}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Leave empty or 0 for full credit. Can pay any amount (partial, full, or advance).
            </p>
          </div>

          <div className="border-t pt-4 space-y-1">
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Subtotal</span><span>{formatMoney(subtotal)}</span></div>
            {discount > 0 && <div className="flex justify-between text-sm"><span className="text-muted-foreground">Discount</span><span>-{formatMoney(discount)}</span></div>}
            <div className="flex justify-between text-lg font-heading font-bold pt-2 border-t">
              <span>Total</span><span className="text-primary">{formatMoney(total)}</span>
            </div>
            {(Number(paidAmount) || 0) > 0 && (Number(paidAmount) || 0) < total && (
              <div className="flex justify-between text-sm text-destructive font-medium">
                <span>Remaining</span><span>{formatMoney(total - (Number(paidAmount) || 0))}</span>
              </div>
            )}
            {(Number(paidAmount) || 0) > total && (
              <div className="flex justify-between text-sm text-success font-medium">
                <span>Advance</span><span>{formatMoney((Number(paidAmount) || 0) - total)}</span>
              </div>
            )}
          </div>

          <Button className="w-full" size="lg" onClick={handleSubmit}>
            {isHistorical ? 'Save Old Order' : 'Create Invoice'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

