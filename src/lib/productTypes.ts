import type { Product } from '@/lib/storage';

export type ProductType = 'oil' | 'carton';

export type CartonSize = '1 Liter' | '0.75 Liter';

export const PRODUCT_TYPES: { value: ProductType; label: string }[] = [
  { value: 'oil', label: 'Oil' },
  { value: 'carton', label: 'Carton' },
];

export const CARTON_SIZES: { value: CartonSize; label: string }[] = [
  { value: '1 Liter', label: '1 Liter' },
  { value: '0.75 Liter', label: '0.75 Liter' },
];

export function normalizeProductType(
  productType: ProductType | undefined | null,
): ProductType {
  if (productType === 'carton') return 'carton';
  return 'oil';
}

export function isCartonProduct(
  product: Pick<Product, 'productType'>,
): boolean {
  return normalizeProductType(product.productType) === 'carton';
}

export function isOilProduct(
  product: Pick<Product, 'productType'>,
): boolean {
  return normalizeProductType(product.productType) === 'oil';
}

export function normalizeProduct(product: Product): Product {
  const productType = normalizeProductType(product.productType);
  return {
    ...product,
    productType,
    cartonSize: productType === 'carton' ? product.cartonSize : undefined,
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

export function formatProductPriceSuffix(product: Pick<Product, 'productType'>): string {
  if (isCartonProduct(product)) return '/carton';
  return '/L';
}

export function formatStockLabel(
  product: Pick<Product, 'productType' | 'stock'>,
): string {
  if (isCartonProduct(product)) {
    const count = Math.round(product.stock);
    return `${count} carton${count === 1 ? '' : 's'} in stock`;
  }
  return `${product.stock}L in stock`;
}

export function formatStockShort(
  product: Pick<Product, 'productType' | 'stock'>,
): string {
  if (isCartonProduct(product)) {
    return `${Math.round(product.stock)} cartons`;
  }
  return `${product.stock}L`;
}

export function formatQuantityUnit(
  productType: ProductType | undefined,
): string {
  if (normalizeProductType(productType) === 'carton') return 'cartons';
  return 'L';
}

export function formatCartonSizeLabel(cartonSize?: CartonSize): string {
  if (!cartonSize) return '';
  return cartonSize;
}

export function productDisplayName(
  product: Pick<Product, 'name' | 'productType' | 'cartonSize'>,
): string {
  if (isCartonProduct(product) && product.cartonSize) {
    return `${product.name} (${product.cartonSize})`;
  }
  return product.name;
}

export function productTypeBadgeLabel(productType: ProductType | undefined): string {
  return isCartonProduct({ productType }) ? 'Carton' : 'Oil';
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

export function formatLineItemQuantity(item: Pick<Product, 'productType'> & { quantity: number }): string {
  if (isCartonProduct(item)) {
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
  return `${item.quantity} L`;
}

export function formatLineItemPriceLabel(productType?: ProductType): string {
  if (normalizeProductType(productType) === 'carton') return 'Price/carton';
  return 'Price/L';
}

export function formatPurchaseQtySummary(
  items: Pick<Product, 'productType'> & { quantity: number }[],
): string {
  const oilQty = items
    .filter((item) => !isCartonProduct(item))
    .reduce((sum, item) => sum + item.quantity, 0);
  const cartonQty = items
    .filter((item) => isCartonProduct(item))
    .reduce((sum, item) => sum + item.quantity, 0);
  const parts: string[] = [];
  if (oilQty > 0) parts.push(`${oilQty}L`);
  if (cartonQty > 0) parts.push(`${Math.round(cartonQty)} cartons`);
  return parts.length > 0 ? parts.join(' · ') : '0';
}
