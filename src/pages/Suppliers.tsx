import { useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Search, Pencil, Trash2, Truck } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormLabel } from '@/components/ui/FormLabel';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supplierSchema, type SupplierFormData } from '@/lib/validation';
import { useStockPurchasesQuery, useSuppliersList } from '@/hooks/useShopData';
import { useSupplierMutations } from '@/hooks/useShopMutations';
import { toast } from 'sonner';
import ConfirmDeleteDialog from '@/components/ConfirmDeleteDialog';
import ListPagination from '@/components/ui/ListPagination';
import type { Supplier } from '@/lib/storage';
import { usePagination } from '@/hooks/usePagination';

export default function Suppliers() {
  const { suppliers } = useSuppliersList();
  const { data: purchases = [] } = useStockPurchasesQuery();
  const { add: addSupplier, update: updateSupplier, remove: deleteSupplier } = useSupplierMutations();
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null);
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);

  const form = useForm<SupplierFormData>({
    resolver: zodResolver(supplierSchema),
    defaultValues: { name: '', phone: '', address: '' },
  });

  const filtered = useMemo(
    () => suppliers.filter(s =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.phone.includes(search)
    ),
    [suppliers, search]
  );

  const {
    paginatedItems: paginatedSuppliers,
    page,
    setPage,
    pageSize,
    setPageSize,
    totalItems,
    totalPages,
  } = usePagination(filtered, [search]);

  const openAdd = () => {
    setEditing(null);
    form.reset({ name: '', phone: '', address: '' });
    setDialogOpen(true);
  };

  const openEdit = (s: Supplier) => {
    setEditing(s);
    form.reset({ name: s.name, phone: s.phone, address: s.address });
    setDialogOpen(true);
  };

  const onSubmit = (data: SupplierFormData) => {
    const payload = { name: data.name, phone: data.phone || '', address: data.address || '' };
    if (editing) {
      updateSupplier.mutate(
        { id: editing.id, data: payload },
        {
          onSuccess: () => {
            toast.success('Supplier updated — purchase records updated too');
            setDialogOpen(false);
          },
          onError: () => toast.error('Could not update supplier'),
        }
      );
      return;
    }
    addSupplier.mutate(payload, {
      onSuccess: () => {
        toast.success('Supplier added');
        setDialogOpen(false);
      },
      onError: () => toast.error('Could not add supplier'),
    });
  };

  const openDelete = (supplier: Supplier) => {
    const purchaseCount = purchases.filter(p => p.supplierId === supplier.id).length;
    setDeleteTarget(supplier);
    if (purchaseCount > 0) {
      setBlockedMessage(`This supplier has ${purchaseCount} purchase record(s) and cannot be deleted.`);
      return;
    }
    setBlockedMessage(null);
  };

  const closeDelete = () => {
    setDeleteTarget(null);
    setBlockedMessage(null);
  };

  const confirmDelete = () => {
    if (!deleteTarget || blockedMessage) return;
    deleteSupplier.mutate(deleteTarget.id, {
      onSuccess: () => {
        toast.success('Supplier deleted');
        closeDelete();
      },
      onError: () => toast.error('Cannot delete supplier with existing purchases'),
    });
  };

  const getPurchaseCount = (id: string) =>
    purchases.filter(p => p.supplierId === id).length;

  return (
    <div className="space-y-4 pb-16 lg:pb-0 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-heading font-bold">Suppliers / Dealers</h1>
        <Button size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-1" />Add Supplier</Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search suppliers..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      {filtered.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No suppliers found</CardContent></Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {paginatedSuppliers.map(s => (
            <Card key={s.id} className="group">
              <CardContent className="pt-5">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
                      <Truck className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-heading font-semibold">{s.name}</h3>
                      {s.phone && <p className="text-xs text-muted-foreground">{s.phone}</p>}
                    </div>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(s)}><Pencil className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => openDelete(s)}><Trash2 className="w-4 h-4" /></Button>
                  </div>
                </div>
                {s.address && <p className="text-xs text-muted-foreground mb-1">{s.address}</p>}
                <p className="text-xs text-muted-foreground mt-2">{getPurchaseCount(s.id)} purchase(s)</p>
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
            <DialogTitle className="font-heading">{editing ? 'Edit Supplier' : 'Add Supplier'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <FormLabel required>Name</FormLabel>
              <Input {...form.register('name')} />
              {form.formState.errors.name && <p className="text-xs text-destructive mt-1">{form.formState.errors.name.message}</p>}
            </div>
            <div>
              <FormLabel>Phone</FormLabel>
              <Input {...form.register('phone')} />
            </div>
            <div>
              <FormLabel>Address</FormLabel>
              <Input {...form.register('address')} />
            </div>
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit">{editing ? 'Update' : 'Add'} Supplier</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && closeDelete()}
        title={blockedMessage ? 'Cannot delete supplier' : `Delete "${deleteTarget?.name}"?`}
        description={
          blockedMessage ?? 'This will permanently remove the supplier from your records. This action cannot be undone.'
        }
        blocked={Boolean(blockedMessage)}
        onConfirm={confirmDelete}
        isLoading={deleteSupplier.isPending}
      />
    </div>
  );
}



