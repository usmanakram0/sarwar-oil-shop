import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Trash2, ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormLabel } from '@/components/ui/FormLabel';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import CustomerSearchCombobox from '@/components/forms/CustomerSearchCombobox';
import { type InvoiceItem } from '@/lib/storage';
import { CURRENCY, formatMoney } from '@/lib/currency';
import {
  filterProductsByType,
  formatLineItemPriceLabel,
  formatQuantityUnit,
  formatStockShort,
  normalizeProductType,
  productDisplayName,
  type ProductType,
} from '@/lib/productTypes';
import { WALKING_CUSTOMER_NAME } from '@/lib/walkingCustomer';
import {
  useCustomerBalanceQuery,
  useCustomersList,
  useInvoiceQuery,
  useProductsList,
} from '@/hooks/useShopData';
import { useInvoiceMutations } from '@/hooks/useShopMutations';
import { isInvoiceClosed } from '@/lib/invoiceLifecycle';
import { toast } from 'sonner';

export default function InvoiceEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: invoice, isLoading } = useInvoiceQuery(id);
  const { products } = useProductsList();
  const { customers } = useCustomersList();
  const { edit: editInvoice } = useInvoiceMutations();

  const [customerId, setCustomerId] = useState('');
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [discount, setDiscount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'credit'>('cash');
  const [paidAmount, setPaidAmount] = useState<number | ''>('');
  const [loaded, setLoaded] = useState(false);

  const { data: balanceData } = useCustomerBalanceQuery(customerId);
  const customerBalance = customerId ? (balanceData ?? null) : null;

  useEffect(() => {
    if (!invoice || loaded) return;
    setCustomerId(invoice.customerId);
    setItems(invoice.items.map((item) => ({ ...item })));
    setDiscount(invoice.discount);
    setPaymentMethod(invoice.paymentMethod);
    setPaidAmount(invoice.paidAmount || '');
    setLoaded(true);
  }, [invoice, loaded]);

  const subtotal = items.reduce((sum, item) => sum + item.total, 0);
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

  const advanceApplied = useMemo(() => {
    if (!customerBalance || customerBalance.balance >= 0) return 0;
    return Math.min(Math.abs(customerBalance.balance), total);
  }, [customerBalance, total]);

  const amountDue = useMemo(
    () => Math.max(0, total - advanceApplied),
    [total, advanceApplied],
  );

  const addItem = (productType: ProductType = 'oil') => {
    setItems([
      ...items,
      {
        productId: '',
        productName: '',
        productType,
        pricePerLiter: 0,
        appliedPrice: 0,
        quantity: 1,
        total: 0,
      },
    ]);
  };

  const updateItem = (index: number, field: string, value: string | number) => {
    const updated = [...items];
    const item = { ...updated[index] };

    if (field === 'productId') {
      const product = products.find((entry) => entry.id === value);
      if (product) {
        item.productId = product.id;
        item.productName = product.name;
        item.productType = normalizeProductType(product.productType);
        item.cartonSize = product.cartonSize;
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

  const removeItem = (index: number) => {
    setItems(items.filter((_, itemIndex) => itemIndex !== index));
  };

  const handleSubmit = () => {
    if (!invoice) return;
    if (items.length === 0) {
      toast.error('Please add at least one product');
      return;
    }
    const invalidItems = items.filter((item) => !item.productId || item.quantity <= 0);
    if (invalidItems.length > 0) {
      toast.error('Please fill in all product details');
      return;
    }

    if (discount > subtotal) {
      toast.error(`Discount cannot exceed bill amount (${formatMoney(subtotal)})`);
      return;
    }

    const paid = Number(paidAmount) || 0;
    const customer = customerId ? customers.find((entry) => entry.id === customerId) : null;
    const totalPaid = advanceApplied + paid;
    const remaining = Math.max(0, total - totalPaid);

    let status: 'paid' | 'pending' | 'partial' = 'pending';
    if (remaining <= 0) status = 'paid';
    else if (totalPaid > 0) status = 'partial';

    editInvoice.mutate(
      {
        id: invoice.id,
        invoice: {
          customerId: customerId || '',
          customerName: customer?.name || WALKING_CUSTOMER_NAME,
          items,
          subtotal,
          discount,
          tax: 0,
          total,
          paidAmount: paid,
          remainingAmount: remaining,
          paymentMethod,
          status,
        },
      },
      {
        onSuccess: () => {
          toast.success('Invoice updated');
          navigate(`/invoices/${invoice.id}`);
        },
        onError: (error) =>
          toast.error(
            error instanceof Error ? error.message : 'Could not update invoice',
          ),
      },
    );
  };

  if (isLoading || !loaded) {
    return (
      <div className="text-center py-12 text-muted-foreground">Loading invoice...</div>
    );
  }

  if (!invoice) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Invoice not found</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate('/invoices')}>
          Back to Invoices
        </Button>
      </div>
    );
  }

  if (isInvoiceClosed(invoice)) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Closed invoices cannot be edited</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate(`/invoices/${invoice.id}`)}>
          Back to Invoice
        </Button>
      </div>
    );
  }

  const cur = CURRENCY;

  return (
    <div className="space-y-4 pb-16 lg:pb-0 animate-fade-in max-w-3xl">
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="icon" onClick={() => navigate(`/invoices/${invoice.id}`)}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-heading font-bold">Edit Invoice</h1>
          <p className="text-sm text-muted-foreground">{invoice.invoiceNumber}</p>
        </div>
        {invoice.historical && (
          <Badge variant="outline" className="border-amber-500 text-amber-700 dark:text-amber-300">
            Old record — stock will not change
          </Badge>
        )}
      </div>

      <Card className="border-dashed border-primary/30 bg-primary/5">
        <CardContent className="pt-4 pb-4 text-sm text-muted-foreground">
          Saving will refill containers for the previous quantities, then deduct the
          updated amounts. Customer ledger entries for this invoice are rebuilt
          automatically.
        </CardContent>
      </Card>

      <Card className="border-l-4 border-l-primary">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-heading">Customer</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <CustomerSearchCombobox
            customers={customers}
            value={customerId}
            onValueChange={setCustomerId}
          />
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

      <Card className="border-l-4 border-l-accent">
        <CardHeader className="pb-3 flex flex-row items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-sm font-heading">Products</CardTitle>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => addItem('oil')}>
              <Plus className="w-4 h-4 mr-1" />
              Add oil
            </Button>
            <Button size="sm" variant="outline" onClick={() => addItem('carton')}>
              <Plus className="w-4 h-4 mr-1" />
              Add carton
            </Button>
            <Button size="sm" variant="outline" onClick={() => addItem('can')}>
              <Plus className="w-4 h-4 mr-1" />
              Add can
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {items.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">
              No products added yet
            </p>
          )}
          {items.map((item, index) => {
            const lineType = normalizeProductType(item.productType);
            const lineProducts = filterProductsByType(products, lineType);
            const isCartonLine = lineType === 'carton';
            const isCanLine = lineType === 'can';
            const isUnitLine = isCartonLine || isCanLine;
            const lineLabel = isCartonLine ? 'Carton' : isCanLine ? 'Can' : 'Oil';
            const selectPlaceholder = isCartonLine
              ? 'carton'
              : isCanLine
                ? 'can'
                : 'oil';
            return (
              <div
                key={index}
                className="p-3 rounded-lg bg-muted/30 border border-border/50 space-y-2">
                <div className="flex gap-2 items-center">
                  <span className="text-xs font-medium text-muted-foreground px-2 py-1 rounded bg-background border">
                    {lineLabel}
                  </span>
                  <div className="flex-1">
                    <Select
                      value={item.productId}
                      onValueChange={(value) => updateItem(index, 'productId', value)}>
                      <SelectTrigger>
                        <SelectValue placeholder={`Select ${selectPlaceholder}`} />
                      </SelectTrigger>
                      <SelectContent>
                        {lineProducts.map((product) => (
                          <SelectItem key={product.id} value={product.id}>
                            {productDisplayName(product)} ({formatStockShort(product)})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-destructive shrink-0"
                    onClick={() => removeItem(index)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <FormLabel className="text-xs text-muted-foreground" required>
                      {formatLineItemPriceLabel(lineType)} ({cur})
                    </FormLabel>
                    <Input
                      type="number"
                      step="0.01"
                      value={item.appliedPrice || ''}
                      onChange={(event) =>
                        updateItem(index, 'appliedPrice', event.target.value)
                      }
                    />
                  </div>
                  <div className="w-24">
                    <FormLabel className="text-xs text-muted-foreground" required>
                      Qty ({formatQuantityUnit(lineType)})
                    </FormLabel>
                    <Input
                      type="number"
                      min="1"
                      step={isUnitLine ? '1' : '0.01'}
                      value={item.quantity || ''}
                      onChange={(event) =>
                        updateItem(index, 'quantity', event.target.value)
                      }
                    />
                  </div>
                  <div className="w-28 text-right">
                    <FormLabel className="text-xs text-muted-foreground">Total</FormLabel>
                    <p className="text-sm font-heading font-bold py-2">
                      {formatMoney(item.total)}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card className="border-l-4 border-l-success">
        <CardContent className="pt-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <FormLabel>Discount ({cur})</FormLabel>
              <Input
                type="number"
                min="0"
                max={subtotal}
                step="0.01"
                value={discount || ''}
                disabled={subtotal <= 0}
                onChange={(event) => handleDiscountChange(event.target.value)}
              />
            </div>
            <div>
              <FormLabel required>Payment Method</FormLabel>
              <Select
                value={paymentMethod}
                onValueChange={(value) =>
                  setPaymentMethod(value as 'cash' | 'card' | 'credit')
                }>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="credit">Credit</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <FormLabel>Amount Paid ({cur})</FormLabel>
            <Input
              type="number"
              min="0"
              placeholder={`Due: ${formatMoney(amountDue)}`}
              value={paidAmount}
              onChange={(event) =>
                setPaidAmount(event.target.value === '' ? '' : Number(event.target.value))
              }
            />
          </div>

          <div className="border-t pt-4 space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{formatMoney(subtotal)}</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Discount</span>
                <span>-{formatMoney(discount)}</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-heading font-bold pt-2 border-t">
              <span>Total</span>
              <span className="text-primary">{formatMoney(total)}</span>
            </div>
          </div>

          <Button
            className="w-full"
            size="lg"
            onClick={handleSubmit}
            disabled={editInvoice.isPending}>
            {editInvoice.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
