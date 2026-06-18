import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface FormLabelProps extends React.ComponentProps<typeof Label> {
  required?: boolean;
}

export function FormLabel({
  required = false,
  children,
  className,
  ...props
}: FormLabelProps) {
  return (
    <Label className={cn(className)} {...props}>
      {children}
      {!required && (
        <span className="font-normal opacity-80 ml-1">(optional)</span>
      )}
    </Label>
  );
}
