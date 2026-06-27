import type { Product } from '@/lib/storage';
import { isUnitCountedProduct } from '@/lib/productTypes';

export class StockMovementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StockMovementError';
  }
}

const OIL_STOCK_SCALE = 1000;

export function roundStockLevel(
  product: Pick<Product, 'productType'>,
  stock: number,
): number {
  if (!Number.isFinite(stock)) {
    throw new StockMovementError('Invalid stock amount');
  }
  if (stock < 0) {
    throw new StockMovementError('Stock cannot be negative');
  }
  if (isUnitCountedProduct(product)) {
    return Math.round(stock);
  }
  return Math.round(stock * OIL_STOCK_SCALE) / OIL_STOCK_SCALE;
}

/** Validate and normalize a line quantity (liters or cartons). */
export function normalizeLineQuantity(
  product: Pick<Product, 'productType'>,
  quantity: number,
): number {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new StockMovementError('Quantity must be greater than 0');
  }
  if (isUnitCountedProduct(product)) {
    const whole = Math.round(quantity);
    if (Math.abs(quantity - whole) > 1e-9) {
      throw new StockMovementError('Quantity must be a whole number of units');
    }
    return whole;
  }
  return roundStockLevel(product, quantity);
}

export function aggregateQuantitiesByProduct(
  lines: { productId: string; quantity: number }[],
): Map<string, number> {
  const totals = new Map<string, number>();

  for (const line of lines) {
    if (!line.productId) {
      throw new StockMovementError('Each line must reference a product');
    }
    totals.set(
      line.productId,
      (totals.get(line.productId) ?? 0) + line.quantity,
    );
  }

  return totals;
}

export function buildStockDeltaMap(
  lines: { productId: string; quantity: number }[],
  direction: 'in' | 'out',
): Map<string, number> {
  const totals = aggregateQuantitiesByProduct(lines);
  const multiplier = direction === 'in' ? 1 : -1;
  const deltas = new Map<string, number>();

  for (const [productId, quantity] of totals) {
    deltas.set(productId, multiplier * quantity);
  }

  return deltas;
}

export function validateStockOut(
  products: Product[],
  lines: { productId: string; quantity: number }[],
): void {
  const deltas = buildStockDeltaMap(lines, 'out');
  validateStockDeltas(products, deltas);
}

export function validateStockDeltas(
  products: Product[],
  deltas: Map<string, number>,
): void {
  for (const [productId, delta] of deltas) {
    if (delta >= 0) continue;

    const product = products.find((p) => p.id === productId);
    if (!product) {
      throw new StockMovementError('Product not found for stock update');
    }

    let unit = 'L';
    if (product.productType === 'carton') unit = 'cartons';
    if (product.productType === 'can') unit = 'cans';
    const needed = normalizeLineQuantity(product, Math.abs(delta));
    const available = roundStockLevel(product, product.stock);

    if (needed > available + 1e-9) {
      throw new StockMovementError(
        `Insufficient stock for ${product.name}. Available: ${available} ${unit}, needed: ${needed} ${unit}`,
      );
    }
  }
}

export function applyStockDeltasToProducts(
  products: Product[],
  deltas: Map<string, number>,
  options?: { skipValidation?: boolean },
): Product[] {
  const normalizedDeltas = new Map<string, number>();

  for (const [productId, delta] of deltas) {
    const product = products.find((p) => p.id === productId);
    if (!product) {
      throw new StockMovementError('Product not found for stock update');
    }

    if (delta === 0) continue;

    const sign = delta > 0 ? 1 : -1;
    const magnitude =
      sign > 0
        ? normalizeLineQuantity(product, Math.abs(delta))
        : normalizeLineQuantity(product, Math.abs(delta));
    normalizedDeltas.set(productId, sign * magnitude);
  }

  if (!options?.skipValidation) {
    validateStockDeltas(products, normalizedDeltas);
  }

  const updatedAt = new Date().toISOString();
  const next = products.map((product) => {
    const delta = normalizedDeltas.get(product.id);
    if (delta === undefined) return product;

    const newStock = roundStockLevel(product, product.stock + delta);
    return { ...product, stock: newStock, updatedAt };
  });

  return next;
}

export function applyStockDeltaToProducts(
  products: Product[],
  productId: string,
  quantityDelta: number,
  options?: { skipValidation?: boolean },
): Product[] {
  const deltas = new Map<string, number>([[productId, quantityDelta]]);
  return applyStockDeltasToProducts(products, deltas, options);
}
