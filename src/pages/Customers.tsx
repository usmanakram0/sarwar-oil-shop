import { useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Search, Pencil, Trash2, User } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormLabel } from '@/components/ui/FormLabel';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { customerSchema, type CustomerFormData } from '@/lib/validation';
import { useCustomersList, useInvoicesQuery } from '@/hooks/useShopData';
import { useCustomerMutations } from '@/hooks/useShopMutations';
import { toast } from 'sonner';
import ConfirmDeleteDialog from '@/components/ConfirmDeleteDialog';
import ListPagination from '@/components/ui/ListPagination';
import type { Customer } from '@/lib/storage';
import { usePagination } from '@/hooks/usePagination';

export default function Customers() {
  const { customers } = useCustomersList();
  const { data: invoices = [] } = useInvoicesQuery();
  const { add: addCustomer, update: updateCustomer, remove: deleteCustomer } = useCustomerMutations();
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);

  const form = useForm<CustomerFormData>({
    resolver: zodResolver(customerSchema),
    defaultValues: { name: '', phone: '', address: '' },
  });

  const filtered = useMemo(
    () => customers.filter(c =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.phone.includes(search)
    ),
    [customers, search]
  );

  const {
    paginatedItems: paginatedCustomers,
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

  const openEdit = (c: Customer) => {
    setEditing(c);
    form.reset({ name: c.name, phone: c.phone, address: c.address });
    setDialogOpen(true);
  };

  const onSubmit = (data: CustomerFormData) => {
    const payload = { name: data.name, phone: data.phone || '', address: data.address || '' };
    if (editing) {
      updateCustomer.mutate(
        { id: editing.id, data: payload },
        {
          onSuccess: () => {
            toast.success('Customer updated');
            setDialogOpen(false);
          },
          onError: () => toast.error('Could not update customer'),
        }
      );
      return;
    }
    addCustomer.mutate(payload, {
      onSuccess: () => {
        toast.success('Customer added');
        setDialogOpen(false);
      },
      onError: () => toast.error('Could not add customer'),
    });
  };

  const openDelete = (customer: Customer) => {
    const invoiceCount = invoices.filter(i => i.customerId === customer.id).length;
    setDeleteTarget(customer);
    if (invoiceCount > 0) {
      setBlockedMessage(`This customer has ${invoiceCount} invoice(s) on record and cannot be deleted.`);
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
    deleteCustomer.mutate(deleteTarget.id, {
      onSuccess: () => {
        toast.success('Customer deleted');
        closeDelete();
      },
      onError: () => toast.error('Could not delete customer'),
    });
  };

  const getInvoiceCount = (id: string) => invoices.filter(i => i.customerId === id).length;

  return (
    <div className="space-y-4 pb-16 lg:pb-0 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-heading font-bold">Customers</h1>
        <Button size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-1" />Add Customer</Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search by name or phone..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      {filtered.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No customers found</CardContent></Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {paginatedCustomers.map(c => (
            <Card key={c.id} className="group">
              <CardContent className="pt-5">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-heading font-semibold">{c.name}</h3>
                      {c.phone && <p className="text-xs text-muted-foreground">{c.phone}</p>}
                    </div>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(c)}><Pencil className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => openDelete(c)}><Trash2 className="w-4 h-4" /></Button>
                  </div>
                </div>
                {c.address && <p className="text-xs text-muted-foreground mb-1">{c.address}</p>}
                <p className="text-xs text-muted-foreground mt-2">{getInvoiceCount(c.id)} invoice(s)</p>
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
            <DialogTitle className="font-heading">{editing ? 'Edit Customer' : 'Add Customer'}</DialogTitle>
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
              <Button type="submit">{editing ? 'Update' : 'Add'} Customer</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && closeDelete()}
        title={blockedMessage ? 'Cannot delete customer' : `Delete "${deleteTarget?.name}"?`}
        description={
          blockedMessage ?? 'This will permanently remove the customer from your records. This action cannot be undone.'
        }
        blocked={Boolean(blockedMessage)}
        onConfirm={confirmDelete}
        isLoading={deleteCustomer.isPending}
      />
    </div>
  );
}


