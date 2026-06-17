import { useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Search, Pencil, Trash2, Tags } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { categoryStorage } from '@/lib/storage';
import { oilCategorySchema, type OilCategoryFormData } from '@/lib/validation';
import { useCategoriesQuery } from '@/hooks/useShopData';
import { useCategoryMutations } from '@/hooks/useShopMutations';
import { safeArray } from '@/lib/query/safe';
import { toast } from 'sonner';
import type { OilCategory } from '@/lib/storage';

export default function Categories() {
  const { data: categoriesData } = useCategoriesQuery();
  const categories = safeArray(categoriesData);
  const { add: addCategory, update: updateCategory, remove: deleteCategory } = useCategoryMutations();
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<OilCategory | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<OilCategory | null>(null);
  const [reassignToId, setReassignToId] = useState('');

  const form = useForm<OilCategoryFormData>({
    resolver: zodResolver(oilCategorySchema),
    defaultValues: { name: '' },
  });

  const filtered = useMemo(
    () => categories.filter(c => c.name.toLowerCase().includes(search.toLowerCase())),
    [categories, search]
  );

  const deleteUsage = deleteTarget ? categoryStorage.getUsage(deleteTarget.name) : null;
  const reassignOptions = categories.filter(c => c.id !== deleteTarget?.id);
  const needsReassign =
    !!deleteUsage && (deleteUsage.productCount > 0 || deleteUsage.purchaseLineCount > 0);

  const openAdd = () => {
    setEditing(null);
    form.reset({ name: '' });
    setDialogOpen(true);
  };

  const openEdit = (cat: OilCategory) => {
    setEditing(cat);
    form.reset({ name: cat.name });
    setDialogOpen(true);
  };

  const onSubmit = (data: OilCategoryFormData) => {
    if (editing) {
      updateCategory.mutate(
        { id: editing.id, name: data.name },
        {
          onSuccess: () => {
            toast.success('Category renamed on all products and purchase records');
            setDialogOpen(false);
          },
          onError: (err) => toast.error(err.message),
        }
      );
      return;
    }
    addCategory.mutate(data.name, {
      onSuccess: () => {
        toast.success('Category added');
        setDialogOpen(false);
      },
      onError: (err) => toast.error(err.message),
    });
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    if (needsReassign && !reassignToId) {
      toast.error('Select a category to move existing oils into');
      return;
    }
    deleteCategory.mutate(
      { id: deleteTarget.id, reassignToId: needsReassign ? reassignToId : undefined },
      {
        onSuccess: (result) => {
          toast.success(result.message);
          setDeleteTarget(null);
          setReassignToId('');
        },
        onError: (err) => toast.error(err.message),
      }
    );
  };

  return (
    <>
      <div className="space-y-4 pb-16 lg:pb-0 animate-fade-in max-w-3xl">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-heading font-bold">Oil Categories</h1>
          <Button size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-1" />Add Category</Button>
        </div>

        <p className="text-sm text-muted-foreground">
          Categories are used when adding products and stock purchases. Renaming updates all containers and records.
        </p>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search categories..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>

        {filtered.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">No categories found</CardContent></Card>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {filtered.map(cat => {
              const usage = categoryStorage.getUsage(cat.name);
              return (
                <Card key={cat.id} className="group">
                  <CardContent className="pt-5">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
                          <Tags className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-heading font-semibold">{cat.name}</h3>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {usage.productCount} product(s) · {usage.inStockLiters}L in stock
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(cat)}><Pencil className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteTarget(cat)}><Trash2 className="w-4 h-4" /></Button>
                      </div>
                    </div>
                    {usage.purchaseLineCount > 0 && (
                      <Badge variant="outline" className="text-xs">{usage.purchaseLineCount} purchase line(s)</Badge>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-heading">{editing ? 'Edit Category' : 'Add Category'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <Label>Category name *</Label>
              <Input {...form.register('name')} placeholder="e.g. Engine Oil" />
              {form.formState.errors.name && <p className="text-xs text-destructive mt-1">{form.formState.errors.name.message}</p>}
              {editing && (
                <p className="text-xs text-muted-foreground mt-2">
                  Renaming will update all products and purchase slips that use this category.
                </p>
              )}
            </div>
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit">{editing ? 'Save' : 'Add'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &quot;{deleteTarget?.name}&quot;?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                {needsReassign ? (
                  <>
                    <p>
                      This category is in use. Deleting it without reassigning would leave oils in your containers
                      without a valid category for new sales and stock-in.
                    </p>
                    <ul className="list-disc pl-5 space-y-1">
                      <li><strong>{deleteUsage?.productCount}</strong> product(s) in store ({deleteUsage?.inStockLiters}L total stock)</li>
                      <li><strong>{deleteUsage?.purchaseLineCount}</strong> line(s) on purchase slips</li>
                    </ul>
                    <p>Choose another category — all products and purchase records will be moved to it, then this category will be removed.</p>
                    <div>
                      <Label>Reassign to</Label>
                      <Select value={reassignToId} onValueChange={setReassignToId}>
                        <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                        <SelectContent>
                          {reassignOptions.map(c => (
                            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                ) : (
                  <p>This category is not used by any products or purchases. It can be safely deleted.</p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setDeleteTarget(null); setReassignToId(''); }}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmDelete}
              disabled={needsReassign && !reassignToId}
            >
              {needsReassign ? 'Reassign & delete' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}


