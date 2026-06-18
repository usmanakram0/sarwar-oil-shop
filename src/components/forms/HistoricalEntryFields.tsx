import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormLabel } from '@/components/ui/FormLabel';
import { formatDateInputValue } from '@/lib/historicalEntry';
import { History } from 'lucide-react';

interface HistoricalEntryFieldsProps {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  orderDate: string;
  onOrderDateChange: (date: string) => void;
  showManualNumber?: boolean;
  manualNumber?: string;
  onManualNumberChange?: (value: string) => void;
  manualNumberLabel?: string;
  manualNumberPlaceholder?: string;
  description?: string;
}

export default function HistoricalEntryFields({
  enabled,
  onEnabledChange,
  orderDate,
  onOrderDateChange,
  showManualNumber = false,
  manualNumber = '',
  onManualNumberChange,
  manualNumberLabel = 'Old voucher / invoice number',
  manualNumberPlaceholder = 'e.g. INV-2023-0042',
  description = 'Use this for old written orders or records from before you started using the app. Stock will not be changed.',
}: HistoricalEntryFieldsProps) {
  return (
    <Card className="border-dashed border-amber-400/60 bg-amber-50/40 dark:bg-amber-950/20">
      <CardContent className="pt-4 pb-4 space-y-4">
        <div className="flex items-start gap-3">
          <Checkbox
            id="historical-entry"
            checked={enabled}
            onCheckedChange={(checked) => onEnabledChange(checked === true)}
          />
          <div className="space-y-1 flex-1">
            <Label htmlFor="historical-entry" className="font-medium cursor-pointer flex items-center gap-2">
              <History className="w-4 h-4 text-amber-700 dark:text-amber-300" />
              Old / historical record
            </Label>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
        </div>

        {enabled && (
          <div className="grid sm:grid-cols-2 gap-4 pl-7">
            <div>
              <FormLabel htmlFor="historical-order-date" required>Order date</FormLabel>
              <Input
                id="historical-order-date"
                type="date"
                max={formatDateInputValue()}
                value={orderDate}
                onChange={(e) => onOrderDateChange(e.target.value)}
              />
            </div>
            {showManualNumber && onManualNumberChange && (
              <div>
                <FormLabel htmlFor="historical-manual-number">{manualNumberLabel}</FormLabel>
                <Input
                  id="historical-manual-number"
                  placeholder={manualNumberPlaceholder}
                  value={manualNumber}
                  onChange={(e) => onManualNumberChange(e.target.value)}
                />
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
