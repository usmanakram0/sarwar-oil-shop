import type { Product } from '@/lib/storage';

export type ProductType = 'oil' | 'carton' | 'can';

export type CartonSize = '1 Liter' | '0.75 Liter';

export type CanSize = '10 Liters' | '20 Liters' | '30 Liters';

/** Size variant for carton or can products (stored as `carton_size` in DB). */
export type UnitSize = CartonSize | CanSize;

export const PRODUCT_TYPES: { value: ProductType; label: string }[] = [
  { value: 'oil', label: 'Oil' },
  { value: 'carton', label: 'Carton' },
  { value: 'can', label: 'Can' },
];

export const CARTON_SIZES: { value: CartonSize; label: string }[] = [
  { value: '1 Liter', label: '1 Liter' },
  { value: '0.75 Liter', label: '0.75 Liter' },
];

export const CAN_SIZES: { value: CanSize; label: string }[] = [
  { value: '10 Liters', label: '10 Liters' },
  { value: '20 Liters', label: '20 Liters' },
  { value: '30 Liters', label: '30 Liters' },
];

export function normalizeProductType(
  productType: ProductType | undefined | null,
): ProductType {
  if (productType === 'carton') return 'carton';
  if (productType === 'can') return 'can';
  return 'oil';
}

export function isCartonProduct(
  product: Pick<Product, 'productType'>,
): boolean {
  return normalizeProductType(product.productType) === 'carton';
}

export function isCanProduct(product: Pick<Product, 'productType'>): boolean {
  return normalizeProductType(product.productType) === 'can';
}

export function isOilProduct(
  product: Pick<Product, 'productType'>,
): boolean {
  return normalizeProductType(product.productType) === 'oil';
}

/** Oil is sold by liter; cartons and cans are sold by whole unit count. */
export function isUnitCountedProduct(
  product: Pick<Product, 'productType'>,
): boolean {
  const type = normalizeProductType(product.productType);
  return type === 'carton' || type === 'can';
}

export function buildCanProductName(canSize: CanSize): string {
  return `Can (${canSize})`;
}

export function normalizeProduct(product: Product): Product {
  const productType = normalizeProductType(product.productType);
  const hasUnitSize = productType === 'carton' || productType === 'can';
  return {
    ...product,
    productType,
    name:
      productType === 'can' && product.cartonSize
        ? buildCanProductName(product.cartonSize as CanSize)
        : product.name,
    cartonSize: hasUnitSize ? product.cartonSize : undefined,
  };
}

export function filterProductsByType(
  products: Product[],
  productType: ProductType,
): Product[] {
  return products.filter(
    (p) => normalizeProductType(p.productType) === productType,
  );
}

export function findCanProductBySize(
  products: Product[],
  canSize: CanSize,
): Product | undefined {
  return products.find(
    (p) =>
      isCanProduct(p) &&
      p.cartonSize === canSize,
  );
}

export function formatProductPriceSuffix(product: Pick<Product, 'productType'>): string {
  if (isCartonProduct(product)) return '/carton';
  if (isCanProduct(product)) return '/can';
  return '/L';
}

export function formatStockLabel(
  product: Pick<Product, 'productType' | 'stock'>,
): string {
  if (isCartonProduct(product)) {
    const count = Math.round(product.stock);
    return `${count} carton${count === 1 ? '' : 's'} in stock`;
  }
  if (isCanProduct(product)) {
    const count = Math.round(product.stock);
    return `${count} can${count === 1 ? '' : 's'} in stock`;
  }
  return `${product.stock}L in stock`;
}

export function formatStockShort(
  product: Pick<Product, 'productType' | 'stock'>,
): string {
  if (isCartonProduct(product)) {
    return `${Math.round(product.stock)} cartons`;
  }
  if (isCanProduct(product)) {
    return `${Math.round(product.stock)} cans`;
  }
  return `${product.stock}L`;
}

export function formatQuantityUnit(
  productType: ProductType | undefined,
): string {
  const type = normalizeProductType(productType);
  if (type === 'carton') return 'cartons';
  if (type === 'can') return 'cans';
  return 'L';
}

export function formatUnitSizeLabel(unitSize?: UnitSize): string {
  if (!unitSize) return '';
  return unitSize;
}

export function productDisplayName(
  product: Pick<Product, 'name' | 'productType' | 'cartonSize'>,
): string {
  if (isCanProduct(product) && product.cartonSize) {
    return buildCanProductName(product.cartonSize as CanSize);
  }
  if (isCartonProduct(product) && product.cartonSize) {
    return `${product.name} (${product.cartonSize})`;
  }
  return product.name;
}

export function productTypeBadgeLabel(productType: ProductType | undefined): string {
  const type = normalizeProductType(productType);
  if (type === 'carton') return 'Carton';
  if (type === 'can') return 'Can';
  return 'Oil';
}

type LineItemLike = Pick<Product, 'productType' | 'cartonSize'> & {
  productName: string;
  quantity: number;
};

export function lineItemDisplayName(item: LineItemLike): string {
  return productDisplayName({
    name: item.productName,
    productType: item.productType,
    cartonSize: item.cartonSize,
  });
}

export function formatLineItemQuantity(
  item: Pick<Product, 'productType'> & { quantity: number },
): string {
  if (isUnitCountedProduct(item)) {
    return `${Math.round(item.quantity)}`;
  }
  return String(item.quantity);
}

export function formatLineItemQuantityWithUnit(
  item: Pick<Product, 'productType'> & { quantity: number },
): string {
  if (isCartonProduct(item)) {
    const count = Math.round(item.quantity);
    return `${count} carton${count === 1 ? '' : 's'}`;
  }
  if (isCanProduct(item)) {
    const count = Math.round(item.quantity);
    return `${count} can${count === 1 ? '' : 's'}`;
  }
  return `${item.quantity} L`;
}

export function formatLineItemPriceLabel(productType?: ProductType): string {
  const type = normalizeProductType(productType);
  if (type === 'carton') return 'Price/carton';
  if (type === 'can') return 'Price/can';
  return 'Price/L';
}

export function formatPurchaseQtySummary(
  items: Pick<Product, 'productType'> & { quantity: number }[],
): string {
  const oilQty = items
    .filter((item) => isOilProduct(item))
    .reduce((sum, item) => sum + item.quantity, 0);
  const cartonQty = items
    .filter((item) => isCartonProduct(item))
    .reduce((sum, item) => sum + item.quantity, 0);
  const canQty = items
    .filter((item) => isCanProduct(item))
    .reduce((sum, item) => sum + item.quantity, 0);
  const parts: string[] = [];
  if (oilQty > 0) parts.push(`${oilQty}L`);
  if (cartonQty > 0) parts.push(`${Math.round(cartonQty)} cartons`);
  if (canQty > 0) parts.push(`${Math.round(canQty)} cans`);
  return parts.length > 0 ? parts.join(' · ') : '0';
}
