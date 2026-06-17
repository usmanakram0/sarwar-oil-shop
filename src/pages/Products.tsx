import { useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Search, Pencil, Trash2, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CURRENCY, formatMoney } from '@/lib/currency';
import { isLowStock, isOutOfStock } from '@/lib/inventory';
import { productSchema, type ProductFormData } from '@/lib/validation';
import { useCategoryNames } from '@/hooks/useCategories';
import { useProductsList } from '@/hooks/useShopData';
import { useProductMutations } from '@/hooks/useShopMutations';
import { toast } from 'sonner';
import ConfirmDeleteDialog from '@/components/ConfirmDeleteDialog';
import { Badge } from '@/components/ui/badge';
import type { Product } from '@/lib/storage';

export default function Products() {
  const cur = CURRENCY;
  const categoryNames = useCategoryNames();
  const { products } = useProductsList();
  const { add: addProduct, update: updateProduct, remove: deleteProduct } = useProductMutations();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);

  const form = useForm<ProductFormData>({
    resolver: zodResolver(productSchema),
    defaultValues: { name: '', pricePerLiter: 0, stock: 0, category: '' },
  });

  const filtered = useMemo(() => {
    return products.filter(p => {
      const matchSearch = p.name.toLowerCase().includes(search.toLowerCase());
      const matchCategory = categoryFilter === 'all' || p.category === categoryFilter;
      return matchSearch && matchCategory;
    });
  }, [products, search, categoryFilter]);

  const openAdd = () => {
    setEditingProduct(null);
    form.reset({ name: '', pricePerLiter: 0, stock: 0, category: '' });
    setDialogOpen(true);
  };

  const openEdit = (product: Product) => {
    setEditingProduct(product);
    form.reset({ name: product.name, pricePerLiter: product.pricePerLiter, stock: product.stock, category: product.category });
    setDialogOpen(true);
  };

  const onSubmit = (data: ProductFormData) => {
    const payload = data as Omit<Product, 'id' | 'createdAt' | 'updatedAt'>;
    if (editingProduct) {
      updateProduct.mutate(
        { id: editingProduct.id, data: payload },
        {
          onSuccess: () => {
            toast.success('Product updated');
            setDialogOpen(false);
          },
          onError: () => toast.error('Could not update product'),
        }
      );
      return;
    }
    const exists = products.find(p => p.name.toLowerCase() === data.name.toLowerCase());
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

  const getStockBadge = (stock: number) => {
    if (isOutOfStock(stock)) return <Badge variant="destructive">Out of stock</Badge>;
    if (isLowStock(stock)) return <Badge variant="outline" className="border-destructive text-destructive">Low</Badge>;
    return <Badge variant="outline" className="border-success text-success">In stock</Badge>;
  };

  return (
    <div className="space-y-4 pb-16 lg:pb-0 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-heading font-bold">Products</h1>
        <Button size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-1" />Add Product</Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search products..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder="All Categories" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categoryNames.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Products Grid */}
      {filtered.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No products found</CardContent></Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(product => (
            <Card key={product.id} className="group">
              <CardContent className="pt-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-heading font-semibold">{product.name}</h3>
                    <p className="text-xs text-muted-foreground">{product.category}</p>
                  </div>
                  {getStockBadge(product.stock)}
                </div>
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-2xl font-heading font-bold text-primary">{formatMoney(product.pricePerLiter)}<span className="text-xs text-muted-foreground font-body">/L</span></p>
                    <p className="text-sm text-muted-foreground">{product.stock}L in stock</p>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(product)}><Pencil className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteTarget(product)}><Trash2 className="w-4 h-4" /></Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-heading">{editingProduct ? 'Edit Product' : 'Add Product'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <Label htmlFor="name">Product Name</Label>
              <Input id="name" {...form.register('name')} />
              {form.formState.errors.name && <p className="text-xs text-destructive mt-1">{form.formState.errors.name.message}</p>}
            </div>
            <div>
              <Label htmlFor="category">Category</Label>
              <Select value={form.watch('category')} onValueChange={v => form.setValue('category', v)}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {categoryNames.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              {form.formState.errors.category && <p className="text-xs text-destructive mt-1">{form.formState.errors.category.message}</p>}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="price">Price per Liter ({cur})</Label>
                <Input id="price" type="number" step="0.01" {...form.register('pricePerLiter')} />
                {form.formState.errors.pricePerLiter && <p className="text-xs text-destructive mt-1">{form.formState.errors.pricePerLiter.message}</p>}
              </div>
              <div>
                <Label htmlFor="stock">Stock (Liters)</Label>
                <Input id="stock" type="number" {...form.register('stock')} />
                {form.formState.errors.stock && <p className="text-xs text-destructive mt-1">{form.formState.errors.stock.message}</p>}
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit">{editingProduct ? 'Update' : 'Add'} Product</Button>
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

