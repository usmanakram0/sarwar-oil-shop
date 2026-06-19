import { useState } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { Plus, Trash2, ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormLabel } from "@/components/ui/FormLabel";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import HistoricalEntryFields from "@/components/forms/HistoricalEntryFields";
import { type StockPurchase, type StockPurchaseItem } from "@/lib/storage";
import { useProductsList, useSuppliersList } from "@/hooks/useShopData";
import { useStockPurchaseMutations } from "@/hooks/useShopMutations";
import {
  filterProductsByType,
  formatStockShort,
  productDisplayName,
  type CartonSize,
  type ProductType,
} from "@/lib/productTypes";
import { toast } from "sonner";
import { CURRENCY, formatMoney } from "@/lib/currency";
import { formatDateInputValue, validateOrderDate } from "@/lib/historicalEntry";
import { normalizeLineQuantity, StockMovementError } from "@/lib/stockMovement";

type DraftItem = {
  productType: ProductType;
  productId: string;
  productName: string;
  cartonSize: CartonSize | "";
  quantity: number;
  totalPrice: number;
  pricePerLiter: number;
};

const emptyItem = (productType: ProductType = "oil"): DraftItem => ({
  productType,
  productId: "",
  productName: "",
  cartonSize: "",
  quantity: 0,
  totalPrice: 0,
  pricePerLiter: 0,
});

export default function StockInCreate() {
  const navigate = useNavigate();
  const location = useLocation();
  const startHistorical = Boolean(
    (location.state as { historical?: boolean } | null)?.historical,
  );
  const { products } = useProductsList();
  const { suppliers } = useSuppliersList();
  const { create: createPurchase } = useStockPurchaseMutations();
  const cur = CURRENCY;

  const [isHistorical, setIsHistorical] = useState(startHistorical);
  const [orderDate, setOrderDate] = useState(formatDateInputValue());
  const [manualSlipNumber, setManualSlipNumber] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [vehicleDriver, setVehicleDriver] = useState("");
  const [vehicleType, setVehicleType] = useState("");
  const [items, setItems] = useState<DraftItem[]>(() => [emptyItem("oil")]);
  const [paymentMethod, setPaymentMethod] = useState<
    "cash" | "card" | "credit"
  >("cash");
  const [paidAmount, setPaidAmount] = useState<number | "">("");
  const [note, setNote] = useState("");

  const total = items.reduce((sum, i) => sum + i.totalPrice, 0);

  const updateItem = (index: number, patch: Partial<DraftItem>) => {
    const updated = [...items];
    let item = { ...updated[index], ...patch };

    if (patch.productType !== undefined) {
      item = {
        ...emptyItem(patch.productType),
        productType: patch.productType,
      };
    }

    if (patch.productId !== undefined) {
      const product = products.find((p) => p.id === patch.productId);
      if (product) {
        item.productId = product.id;
        item.productName = product.name;
        item.productType = product.productType ?? "oil";
        item.cartonSize = product.cartonSize ?? "";
      }
    }

    if (item.quantity > 0 && item.totalPrice > 0) {
      item.pricePerLiter = item.totalPrice / item.quantity;
    }

    updated[index] = item;
    setItems(updated);
  };

  const addItem = (productType: ProductType) =>
    setItems([...items, emptyItem(productType)]);

  const removeItem = (index: number) => {
    if (items.length <= 1) return;
    setItems(items.filter((_, i) => i !== index));
  };

  const handleSubmit = () => {
    if (!supplierId) {
      toast.error("Please select a supplier / dealer");
      return;
    }

    const supplier = suppliers.find((s) => s.id === supplierId);
    if (!supplier) return;

    const validItems = items.filter(
      (i) => i.productId && i.quantity > 0 && i.totalPrice > 0,
    );

    if (validItems.length === 0) {
      toast.error("Add at least one product with quantity and total price");
      return;
    }

    if (isHistorical) {
      const dateCheck = validateOrderDate(orderDate);
      if (!dateCheck.valid) {
        toast.error(dateCheck.message || "Invalid purchase date");
        return;
      }
    }

    if (!isHistorical) {
      try {
        for (const item of validItems) {
          const product = products.find((p) => p.id === item.productId);
          if (!product) {
            throw new StockMovementError("Product not found");
          }
          normalizeLineQuantity(product, item.quantity);
        }
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Invalid stock quantity",
        );
        return;
      }
    }

    const purchaseItems: StockPurchaseItem[] = validItems.map((i) => ({
      productId: i.productId,
      productName: i.productName.trim(),
      productType: i.productType,
      cartonSize:
        i.productType === "carton" ? (i.cartonSize as CartonSize) : undefined,
      quantity: i.quantity,
      pricePerLiter: i.pricePerLiter,
      total: i.totalPrice,
    }));

    const paid = Number(paidAmount) || 0;
    let status: "paid" | "pending" | "partial" = "pending";
    if (paid >= total) status = "paid";
    else if (paid > 0) status = "partial";

    createPurchase.mutate(
      {
        purchase: {
          supplierId,
          supplierName: supplier.name,
          vehicleNumber: vehicleNumber.trim(),
          vehicleDriver: vehicleDriver.trim(),
          vehicleType: vehicleType.trim(),
          items: purchaseItems,
          total,
          paidAmount: paid,
          remainingAmount: Math.max(0, total - paid),
          paymentMethod,
          status,
          note: note.trim(),
        },
        options: isHistorical
          ? {
              orderDate,
              skipStockUpdate: true,
              manualNumber: manualSlipNumber.trim() || undefined,
            }
          : undefined,
      },
      {
        onSuccess: (purchase: StockPurchase) => {
          toast.success(
            isHistorical ? "Old stock record saved" : "Stock added",
          );
          navigate(`/stock-in/${purchase.id}`);
        },
        onError: (error) =>
          toast.error(
            error instanceof Error ? error.message : "Could not save purchase",
          ),
      },
    );
  };

  const renderLine = (item: DraftItem, index: number) => {
    const typeProducts = filterProductsByType(products, item.productType);
    const isCarton = item.productType === "carton";
    const qtyLabel = isCarton ? "Qty (cartons)" : "Qty (L)";
    const rateLabel = isCarton ? "Rate/carton" : "Rate/L";

    return (
      <div
        key={index}
        className="p-3 rounded-lg bg-muted/30 border border-border/50 space-y-2">
        <div className="flex gap-2 items-center flex-wrap">
          <Select
            value={item.productType}
            onValueChange={(v) =>
              updateItem(index, { productType: v as ProductType })
            }>
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="oil">Oil</SelectItem>
              <SelectItem value="carton">Carton</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex-1 min-w-[180px]">
            <Select
              value={item.productId}
              onValueChange={(v) => updateItem(index, { productId: v })}>
              <SelectTrigger>
                <SelectValue
                  placeholder={`Select ${isCarton ? "carton" : "oil"} product`}
                />
              </SelectTrigger>
              <SelectContent>
                {typeProducts.length === 0 ? (
                  <SelectItem value="__none" disabled>
                    No products yet
                  </SelectItem>
                ) : (
                  typeProducts.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {productDisplayName(p)} ({formatStockShort(p)})
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-destructive shrink-0"
            onClick={() => removeItem(index)}
            disabled={items.length <= 1}>
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex gap-2 items-end flex-wrap">
          <div className="w-28">
            <FormLabel className="text-xs" required>
              {qtyLabel}
            </FormLabel>
            <Input
              type="number"
              min="0"
              step={isCarton ? "1" : "0.01"}
              value={item.quantity || ""}
              onChange={(e) =>
                updateItem(index, { quantity: Number(e.target.value) })
              }
            />
          </div>
          <div className="flex-1 min-w-[120px]">
            <FormLabel className="text-xs" required>
              Total price ({cur})
            </FormLabel>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={item.totalPrice || ""}
              onChange={(e) =>
                updateItem(index, { totalPrice: Number(e.target.value) })
              }
            />
          </div>
          <div className="w-28 text-right">
            <FormLabel required className="text-xs">
              {rateLabel}
            </FormLabel>
            <p className="text-sm font-heading font-bold py-2">
              {item.pricePerLiter > 0 ? formatMoney(item.pricePerLiter) : "—"}
            </p>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4 pb-16 lg:pb-0 animate-fade-in max-w-3xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-2xl font-heading font-bold">
          {isHistorical ? "Add Old Stock Record" : "New Stock Purchase"}
        </h1>
      </div>

      <HistoricalEntryFields
        enabled={isHistorical}
        onEnabledChange={setIsHistorical}
        orderDate={orderDate}
        onOrderDateChange={setOrderDate}
        showManualNumber
        manualNumber={manualSlipNumber}
        onManualNumberChange={setManualSlipNumber}
        manualNumberLabel="Old slip number"
        manualNumberPlaceholder="e.g. PUR-2021-0089"
        description="Record old stock purchases from your written register. Current stock levels will not be changed."
      />

      <Card className="border-l-4 border-l-primary">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-heading">
            Supplier / Dealer
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Select value={supplierId} onValueChange={setSupplierId}>
            <SelectTrigger>
              <SelectValue placeholder="Select supplier" />
            </SelectTrigger>
            <SelectContent>
              {suppliers.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                  {s.phone ? ` (${s.phone})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {suppliers.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No suppliers yet.{" "}
              <Link to="/suppliers" className="text-primary underline">
                Add a supplier
              </Link>{" "}
              first.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="border-l-4 border-l-warning">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-heading">
            Delivery Vehicle (optional)
          </CardTitle>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-3 gap-3">
          <div>
            <FormLabel className="text-xs">Vehicle No.</FormLabel>
            <Input
              placeholder="e.g. ABC-1234"
              value={vehicleNumber}
              onChange={(e) => setVehicleNumber(e.target.value)}
            />
          </div>
          <div>
            <FormLabel className="text-xs">Driver Name</FormLabel>
            <Input
              placeholder="Driver"
              value={vehicleDriver}
              onChange={(e) => setVehicleDriver(e.target.value)}
            />
          </div>
          <div>
            <FormLabel className="text-xs">Vehicle Type</FormLabel>
            <Input
              placeholder="e.g. Tanker"
              value={vehicleType}
              onChange={(e) => setVehicleType(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="border-l-4 border-l-accent">
        <CardHeader className="pb-3 flex flex-row items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-sm font-heading">Stock lines</CardTitle>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => addItem("oil")}>
              <Plus className="w-4 h-4 mr-1" />
              Add oil
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => addItem("carton")}>
              <Plus className="w-4 h-4 mr-1" />
              Add carton
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Select products already added from the{" "}
            <Link to="/products" className="text-primary underline">
              Products
            </Link>{" "}
            page. Stock in only adds quantity to existing products.
          </p>
          {items.map((item, index) => renderLine(item, index))}
        </CardContent>
      </Card>

      <Card className="border-l-4 border-l-success">
        <CardContent className="pt-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <FormLabel required>Payment Method</FormLabel>
              <Select
                value={paymentMethod}
                onValueChange={(v) =>
                  setPaymentMethod(v as "cash" | "card" | "credit")
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
            <div>
              <FormLabel required>Amount paid now ({cur})</FormLabel>
              <Input
                required
                type="number"
                min="0"
                placeholder={`Total: ${formatMoney(total)}`}
                value={paidAmount}
                onChange={(e) =>
                  setPaidAmount(
                    e.target.value === "" ? "" : Number(e.target.value),
                  )
                }
              />
            </div>
          </div>
          <div>
            <FormLabel>Note</FormLabel>
            <Textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Remarks for supplier slip"
            />
          </div>
          <div className="border-t pt-4 space-y-1">
            <div className="flex justify-between text-lg font-heading font-bold">
              <span>Total purchase</span>
              <span className="text-primary">{formatMoney(total)}</span>
            </div>
            {(Number(paidAmount) || 0) < total && (
              <div className="flex justify-between text-sm text-destructive font-medium">
                <span>Pending to supplier</span>
                <span>{formatMoney(total - (Number(paidAmount) || 0))}</span>
              </div>
            )}
          </div>
          <Button
            className="w-full"
            size="lg"
            onClick={handleSubmit}
            disabled={!supplierId}>
            {isHistorical
              ? "Save old stock record"
              : "Register purchase & update stock"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
