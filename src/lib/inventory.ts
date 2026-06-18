import type { Product } from '@/lib/storage';
import { isCartonProduct } from '@/lib/productTypes';

/** Oil products below this level (liters) are treated as low stock. */
export const LOW_STOCK_LITERS = 300;

/** Carton products below this count are treated as low stock. */
export const LOW_STOCK_CARTONS = 10;

export function isOutOfStock(stock: number): boolean {
  return stock === 0;
}

export function isLowStock(product: Pick<Product, 'productType' | 'stock'>): boolean {
  if (isOutOfStock(product.stock)) return false;
  if (isCartonProduct(product)) {
    return product.stock > 0 && product.stock < LOW_STOCK_CARTONS;
  }
  return product.stock > 0 && product.stock < LOW_STOCK_LITERS;
}

export function isLowStockAlert(product: Pick<Product, 'productType' | 'stock'>): boolean {
  if (isCartonProduct(product)) {
    return product.stock < LOW_STOCK_CARTONS;
  }
  return product.stock < LOW_STOCK_LITERS;
}
