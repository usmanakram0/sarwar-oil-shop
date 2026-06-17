import { format, isValid, parseISO } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatDateInputValue } from '@/lib/historicalEntry';
import { cn } from '@/lib/utils';

function parseDateValue(value: string): Date | undefined {
  if (!value) return undefined;
  const date = parseISO(value);
  if (!isValid(date)) return undefined;
  return date;
}

interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  max?: Date;
  min?: Date;
  className?: string;
  id?: string;
}

export function DatePicker({
  value,
  onChange,
  placeholder = 'Pick a date',
  disabled = false,
  max,
  min,
  className,
  id,
}: DatePickerProps) {
  const selected = parseDateValue(value);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            'w-full justify-start text-left font-normal',
            !selected && 'text-muted-foreground',
            className
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {selected ? format(selected, 'dd/MM/yyyy') : <span>{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={date => {
            if (date) {
              onChange(formatDateInputValue(date));
            }
          }}
          disabled={date => {
            if (max && date > max) return true;
            if (min && date < min) return true;
            return false;
          }}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}

interface DatePickerFieldProps extends DatePickerProps {
  label: string;
  labelClassName?: string;
}

export function DatePickerField({
  label,
  labelClassName,
  id,
  ...pickerProps
}: DatePickerFieldProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className={labelClassName}>
        {label}
      </Label>
      <DatePicker id={id} {...pickerProps} />
    </div>
  );
}
