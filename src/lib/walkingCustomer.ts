export const WALKING_CUSTOMER_NAME = 'Walking Customer';

export function isWalkingCustomer(customerId?: string | null): boolean {
  return !customerId;
}

export function getInvoiceCustomerName(
  invoice: { customerId?: string | null; customerName?: string | null }
): string {
  if (isWalkingCustomer(invoice.customerId)) {
    return WALKING_CUSTOMER_NAME;
  }

  return invoice.customerName || WALKING_CUSTOMER_NAME;
}
