/** Products below this level (liters) are treated as low stock. */
export const LOW_STOCK_LITERS = 300;

export function isOutOfStock(stock: number): boolean {
  return stock === 0;
}

export function isLowStock(stock: number): boolean {
  return stock > 0 && stock < LOW_STOCK_LITERS;
}

export function isLowStockAlert(stock: number): boolean {
  return stock < LOW_STOCK_LITERS;
}
