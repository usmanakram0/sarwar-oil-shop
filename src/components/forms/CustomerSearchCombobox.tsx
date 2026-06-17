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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { Customer } from '@/lib/storage';
import { WALKING_CUSTOMER_NAME } from '@/lib/walkingCustomer';

interface CustomerSearchComboboxProps {
  customers: Customer[];
  value: string;
  onValueChange: (customerId: string) => void;
}

export default function CustomerSearchCombobox({
  customers,
  value,
  onValueChange,
}: CustomerSearchComboboxProps) {
  const [open, setOpen] = useState(false);
  const selectedCustomer = customers.find((customer) => customer.id === value);
  const displayLabel = selectedCustomer ? selectedCustomer.name : WALKING_CUSTOMER_NAME;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className={selectedCustomer ? '' : 'text-muted-foreground'}>{displayLabel}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search by name or phone..." />
          <CommandList>
            <CommandEmpty>No customer found.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value={WALKING_CUSTOMER_NAME}
                onSelect={() => {
                  onValueChange('');
                  setOpen(false);
                }}
              >
                <Check
                  className={cn('mr-2 h-4 w-4', value === '' ? 'opacity-100' : 'opacity-0')}
                />
                {WALKING_CUSTOMER_NAME}
              </CommandItem>
              {customers.map((customer) => (
                <CommandItem
                  key={customer.id}
                  value={`${customer.name} ${customer.phone}`}
                  onSelect={() => {
                    onValueChange(customer.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      value === customer.id ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  {customer.name}
                  {customer.phone ? ` (${customer.phone})` : ''}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
