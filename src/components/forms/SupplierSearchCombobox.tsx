import { useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { Supplier } from '@/lib/storage';

interface SupplierSearchComboboxProps {
  suppliers: Supplier[];
  value: string;
  onValueChange: (supplierId: string) => void;
  placeholder?: string;
  emptyMessage?: string;
}

export default function SupplierSearchCombobox({
  suppliers,
  value,
  onValueChange,
  placeholder = 'Select supplier',
  emptyMessage = 'No supplier found.',
}: SupplierSearchComboboxProps) {
  const [open, setOpen] = useState(false);
  const selectedSupplier = suppliers.find((supplier) => supplier.id === value);
  const displayLabel = selectedSupplier ? selectedSupplier.name : placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal hover:bg-transparent hover:text-primary">
          <span className={selectedSupplier ? '' : 'text-muted-foreground'}>
            {displayLabel}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        align="start">
        <Command>
          <CommandInput placeholder="Search by name or phone..." />
          <CommandList>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup>
              {suppliers.map((supplier) => (
                <CommandItem
                  key={supplier.id}
                  value={`${supplier.name} ${supplier.phone}`}
                  onSelect={() => {
                    onValueChange(supplier.id);
                    setOpen(false);
                  }}>
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      value === supplier.id ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  {supplier.name}
                  {supplier.phone ? ` (${supplier.phone})` : ''}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
