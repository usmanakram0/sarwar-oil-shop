import { isToday } from "date-fns";
import type { Invoice } from "@/lib/storage";
import { isActiveSale } from "@/lib/invoiceLifecycle";
import {
  isCanProduct,
  isCartonProduct,
  isOilProduct,
  normalizeProductType,
  type ProductType,
} from "@/lib/productTypes";

export interface TodayProductSale {
  productId: string;
  productName: string;
  productType: ProductType;
  quantity: number;
}

export function getTodayActiveSales(invoices: Invoice[]): Invoice[] {
  return invoices.filter(
    (invoice) => isToday(new Date(invoice.createdAt)) && isActiveSale(invoice),
  );
}

export function getTodayProductSales(invoices: Invoice[]): TodayProductSale[] {
  const quantityByProduct = new Map<string, TodayProductSale>();

  for (const invoice of getTodayActiveSales(invoices)) {
    for (const item of invoice.items) {
      const productType = normalizeProductType(item.productType);
      const key = `${item.productId}:${productType}`;
      const existing = quantityByProduct.get(key);
      if (existing) {
        existing.quantity += item.quantity;
      } else {
        quantityByProduct.set(key, {
          productId: item.productId,
          productName: item.productName,
          productType,
          quantity: item.quantity,
        });
      }
    }
  }

  return [...quantityByProduct.values()].sort((a, b) =>
    a.productName.localeCompare(b.productName),
  );
}

export function getTodayTotalLiters(invoices: Invoice[]): number {
  return getTodayProductSales(invoices)
    .filter((p) => isOilProduct(p))
    .reduce((sum, product) => sum + product.quantity, 0);
}

export function getTodayTotalCartons(invoices: Invoice[]): number {
  return getTodayProductSales(invoices)
    .filter((p) => isCartonProduct(p))
    .reduce((sum, product) => sum + product.quantity, 0);
}

export function getTodayTotalCans(invoices: Invoice[]): number {
  return getTodayProductSales(invoices)
    .filter((p) => isCanProduct(p))
    .reduce((sum, product) => sum + product.quantity, 0);
}

export function getTodayOilProductSales(invoices: Invoice[]): TodayProductSale[] {
  return getTodayProductSales(invoices).filter((product) => isOilProduct(product));
}

export function getTodayCartonProductSales(invoices: Invoice[]): TodayProductSale[] {
  return getTodayProductSales(invoices).filter((product) => isCartonProduct(product));
}

export function getTodayCanProductSales(invoices: Invoice[]): TodayProductSale[] {
  return getTodayProductSales(invoices).filter((product) => isCanProduct(product));
}

export function formatLiters(quantity: number): string {
  const displayValue = Number.isInteger(quantity)
    ? quantity
    : parseFloat(quantity.toFixed(2));
  return `${displayValue.toLocaleString()} L`;
}

export function formatCartons(quantity: number): string {
  const displayValue = Math.round(quantity);
  return `${displayValue.toLocaleString()} carton${displayValue === 1 ? '' : 's'}`;
}

export function formatCans(quantity: number): string {
  const displayValue = Math.round(quantity);
  return `${displayValue.toLocaleString()} can${displayValue === 1 ? '' : 's'}`;
}

export function formatSaleQuantity(sale: TodayProductSale): string {
  if (isCartonProduct(sale)) {
    return formatCartons(sale.quantity);
  }
  if (isCanProduct(sale)) {
    return formatCans(sale.quantity);
  }
  return formatLiters(sale.quantity);
}
