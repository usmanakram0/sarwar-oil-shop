import { useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Search, Pencil, Trash2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FormLabel } from '@/components/ui/FormLabel';
import ListPagination from '@/components/ui/ListPagination';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CURRENCY, formatMoney } from '@/lib/currency';
import { isLowStock, isOutOfStock } from '@/lib/inventory';
import { productSchema, type ProductFormData } from '@/lib/validation';
import { useProductsList } from '@/hooks/useShopData';
import { useProductMutations } from '@/hooks/useShopMutations';
import { usePagination } from '@/hooks/usePagination';
import {
  CARTON_SIZES,
  PRODUCT_TYPES,
  formatProductPriceSuffix,
  formatStockLabel,
  isCartonProduct,
  normalizeProductType,
  productTypeBadgeLabel,
  type CartonSize,
  type ProductType,
} from '@/lib/productTypes';
import { toast } from 'sonner';
import ConfirmDeleteDialog from '@/components/ConfirmDeleteDialog';
import { Badge } from '@/components/ui/badge';
import type { Product } from '@/lib/storage';

export default function Products() {
  const cur = CURRENCY;
  const { products } = useProductsList();
  const { add: addProduct, update: updateProduct, remove: deleteProduct } = useProductMutations();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | ProductType>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);

  const form = useForm<ProductFormData>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: '',
      productType: 'oil',
      cartonSize: undefined,
      pricePerLiter: 0,
      stock: 0,
    },
  });

  const watchedType = form.watch('productType');
  const isCartonForm = watchedType === 'carton';

  const filtered = useMemo(() => {
    return products.filter((p) => {
      const matchSearch = p.name.toLowerCase().includes(search.toLowerCase());
      const matchType =
        typeFilter === 'all' || normalizeProductType(p.productType) === typeFilter;
      return matchSearch && matchType;
    });
  }, [products, search, typeFilter]);

  const {
    paginatedItems: paginatedProducts,
    page,
    setPage,
    pageSize,
    setPageSize,
    totalItems,
    totalPages,
  } = usePagination(filtered, [search, typeFilter]);

  const openAdd = () => {
    setEditingProduct(null);
    form.reset({
      name: '',
      productType: 'oil',
      cartonSize: undefined,
      pricePerLiter: 0,
      stock: 0,
    });
    setDialogOpen(true);
  };

  const openEdit = (product: Product) => {
    setEditingProduct(product);
    const productType = normalizeProductType(product.productType);
    form.reset({
      name: product.name,
      productType,
      cartonSize: productType === 'carton' ? product.cartonSize : undefined,
      pricePerLiter: product.pricePerLiter,
      stock: product.stock,
    });
    setDialogOpen(true);
  };

  const onSubmit = (data: ProductFormData) => {
    const payload: Omit<Product, 'id' | 'createdAt' | 'updatedAt'> = {
      name: data.name,
      productType: data.productType,
      cartonSize: data.productType === 'carton' ? data.cartonSize : undefined,
      pricePerLiter: data.pricePerLiter,
      stock: data.stock,
    };

    if (editingProduct) {
      updateProduct.mutate(
        { id: editingProduct.id, data: payload },
        {
          onSuccess: () => {
            toast.success('Product updated');
            setDialogOpen(false);
          },
          onError: () => toast.error('Could not update product'),
        },
      );
      return;
    }

    const exists = products.find((p) => {
      if (p.name.toLowerCase() !== data.name.toLowerCase()) return false;
      if (normalizeProductType(p.productType) !== data.productType) return false;
      if (data.productType === 'carton') {
        return p.cartonSize === data.cartonSize;
      }
      return true;
    });
    if (exists) {
      form.setError('name', { message: 'Product with this name already exists' });
      return;
    }

    addProduct.mutate(payload, {
      onSuccess: () => {
        toast.success('Product added');
        setDialogOpen(false);
      },
      onError: () => toast.error('Could not add product'),
    });
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    deleteProduct.mutate(deleteTarget.id, {
      onSuccess: () => {
        toast.success('Product deleted');
        setDeleteTarget(null);
      },
      onError: () => toast.error('Could not delete product'),
    });
  };

  const getStockBadge = (product: Product) => {
    if (isOutOfStock(product.stock)) {
      return <Badge variant="destructive">Out of stock</Badge>;
    }
    if (isLowStock(product)) {
      return (
        <Badge variant="outline" className="border-destructive text-destructive">
          Low
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="border-success text-success">
        In stock
      </Badge>
    );
  };

  return (
    <div className="space-y-4 pb-16 lg:pb-0 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-heading font-bold">Products</h1>
        <Button size="sm" onClick={openAdd}>
          <Plus className="w-4 h-4 mr-1" />
          Add Product
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search products..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={typeFilter}
          onValueChange={(v) => setTypeFilter(v as 'all' | ProductType)}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {PRODUCT_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No products found
          </CardContent>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {paginatedProducts.map((product) => (
            <Card key={product.id} className="group">
              <CardContent className="pt-5">
                <div className="flex items-start justify-between mb-3 gap-2">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <Badge variant="outline" className="text-xs">
                        {productTypeBadgeLabel(product.productType)}
                      </Badge>
                      {isCartonProduct(product) && product.cartonSize && (
                        <Badge variant="secondary" className="text-xs">
                          {product.cartonSize}
                        </Badge>
                      )}
                    </div>
                    <h3 className="font-heading font-semibold">{product.name}</h3>
                  </div>
                  {getStockBadge(product)}
                </div>
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-2xl font-heading font-bold text-primary">
                      {formatMoney(product.pricePerLiter)}
                      <span className="text-xs text-muted-foreground font-body">
                        {formatProductPriceSuffix(product)}
                      </span>
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {formatStockLabel(product)}
                    </p>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => openEdit(product)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={() => setDeleteTarget(product)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {filtered.length > 0 && (
        <ListPagination
          page={page}
          totalPages={totalPages}
          totalItems={totalItems}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          className="border-t-0 pt-0"
        />
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-heading">
              {editingProduct ? 'Edit Product' : 'Add Product'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <FormLabel htmlFor="name" required>
                Product Name
              </FormLabel>
              <Input id="name" {...form.register('name')} />
              {form.formState.errors.name && (
                <p className="text-xs text-destructive mt-1">
                  {form.formState.errors.name.message}
                </p>
              )}
            </div>

            <div>
              <FormLabel required>Product Type</FormLabel>
              <Select
                value={watchedType}
                disabled={Boolean(editingProduct)}
                onValueChange={(v) => {
                  form.setValue('productType', v as ProductType);
                  if (v === 'oil') {
                    form.setValue('cartonSize', undefined);
                  }
                }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRODUCT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isCartonForm && (
              <div>
                <FormLabel required>Carton Size</FormLabel>
                <Select
                  value={form.watch('cartonSize') ?? ''}
                  disabled={Boolean(editingProduct)}
                  onValueChange={(v) =>
                    form.setValue('cartonSize', v as CartonSize)
                  }>
                  <SelectTrigger>
                    <SelectValue placeholder="Select size" />
                  </SelectTrigger>
                  <SelectContent>
                    {CARTON_SIZES.map((size) => (
                      <SelectItem key={size.value} value={size.value}>
                        {size.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.formState.errors.cartonSize && (
                  <p className="text-xs text-destructive mt-1">
                    {form.formState.errors.cartonSize.message}
                  </p>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <FormLabel htmlFor="price" required>
                  {isCartonForm
                    ? `Price per Carton (${cur})`
                    : `Price per Liter (${cur})`}
                </FormLabel>
                <Input
                  id="price"
                  type="number"
                  step="0.01"
                  {...form.register('pricePerLiter')}
                />
                {form.formState.errors.pricePerLiter && (
                  <p className="text-xs text-destructive mt-1">
                    {form.formState.errors.pricePerLiter.message}
                  </p>
                )}
              </div>
              <div>
                <FormLabel htmlFor="stock" required>
                  {isCartonForm ? 'Stock (Cartons)' : 'Stock (Liters)'}
                </FormLabel>
                <Input id="stock" type="number" {...form.register('stock')} />
                {form.formState.errors.stock && (
                  <p className="text-xs text-destructive mt-1">
                    {form.formState.errors.stock.message}
                  </p>
                )}
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">
                {editingProduct ? 'Update' : 'Add'} Product
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={`Delete "${deleteTarget?.name}"?`}
        description="This will permanently remove the product from your store. Existing invoices and purchase records are not affected. This action cannot be undone."
        onConfirm={confirmDelete}
        isLoading={deleteProduct.isPending}
      />
    </div>
  );
}
