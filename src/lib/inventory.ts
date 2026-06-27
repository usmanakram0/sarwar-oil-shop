import type { Product } from '@/lib/storage';
import { isUnitCountedProduct } from '@/lib/productTypes';

/** Oil products below this level (liters) are treated as low stock. */
export const LOW_STOCK_LITERS = 300;

/** Carton / can products below this count are treated as low stock. */
export const LOW_STOCK_UNITS = 10;

export function isOutOfStock(stock: number): boolean {
  return stock === 0;
}

export function isLowStock(product: Pick<Product, 'productType' | 'stock'>): boolean {
  if (isOutOfStock(product.stock)) return false;
  if (isUnitCountedProduct(product)) {
    return product.stock > 0 && product.stock < LOW_STOCK_UNITS;
  }
  return product.stock > 0 && product.stock < LOW_STOCK_LITERS;
}

export function isLowStockAlert(product: Pick<Product, 'productType' | 'stock'>): boolean {
  if (isUnitCountedProduct(product)) {
    return product.stock < LOW_STOCK_UNITS;
  }
  return product.stock < LOW_STOCK_LITERS;
}
