import { z } from 'zod';

export const productSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(50, 'Name must be less than 50 characters'),
  productType: z.enum(['oil', 'carton']),
  cartonSize: z.enum(['1 Liter', '0.75 Liter']).optional(),
  pricePerLiter: z.preprocess(
    (value) => (value === '' || value === null || value === undefined ? undefined : value),
    z.coerce
      .number({ invalid_type_error: 'Price is required' })
      .positive('Price must be greater than 0')
      .multipleOf(0.01, 'Max 2 decimal places'),
  ),
  stock: z.preprocess(
    (value) => (value === '' || value === null || value === undefined ? 0 : value),
    z.coerce
      .number({ invalid_type_error: 'Enter a valid stock amount' })
      .min(0, 'Stock cannot be negative'),
  ),
}).superRefine((data, ctx) => {
  if (data.productType === 'carton' && !data.cartonSize) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Carton size is required',
      path: ['cartonSize'],
    });
  }
  if (data.productType === 'carton' && !Number.isInteger(data.stock)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Carton stock must be a whole number',
      path: ['stock'],
    });
  }
});

export const customerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100, 'Name must be less than 100 characters'),
  phone: z.string().trim().max(20, 'Phone must be less than 20 characters').optional().or(z.literal('')),
  address: z.string().trim().max(500, 'Address must be less than 500 characters').optional().or(z.literal('')),
});

export const invoiceItemSchema = z.object({
  productId: z.string().min(1, 'Product is required'),
  productName: z.string(),
  pricePerLiter: z.number().positive(),
  quantity: z.coerce.number().positive('Quantity must be greater than 0'),
  total: z.number(),
});

export const invoiceSchema = z.object({
  customerId: z.string().min(1, 'Customer is required'),
  customerName: z.string(),
  items: z.array(invoiceItemSchema).min(1, 'At least one product is required'),
  discount: z.coerce.number().min(0, 'Discount cannot be negative').default(0),
  paymentMethod: z.enum(['cash', 'card', 'credit']),
}).superRefine((data, ctx) => {
  const subtotal = data.items.reduce((sum, item) => sum + item.total, 0);
  if (data.discount > subtotal) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Discount cannot exceed bill amount',
      path: ['discount'],
    });
  }
});

export const supplierSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
  phone: z.string().trim().max(20).optional().or(z.literal('')),
  address: z.string().trim().max(500).optional().or(z.literal('')),
});

export const settingsSchema = z.object({
  shopAddress: z.string().trim().max(500).optional().or(z.literal('')),
  shopPhone: z.string().trim().max(20).optional().or(z.literal('')),
  thankYouMessage: z.string().trim().max(200).optional().or(z.literal('')),
  printerName: z.string().trim().max(120).optional().or(z.literal('')),
});

export type ProductFormData = z.infer<typeof productSchema>;
export type CustomerFormData = z.infer<typeof customerSchema>;
export type SupplierFormData = z.infer<typeof supplierSchema>;
export type InvoiceFormData = z.infer<typeof invoiceSchema>;
export type SettingsFormData = z.infer<typeof settingsSchema>;

export const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});

export const registerSchema = z
  .object({
    firstName: z.string().trim().min(2, 'First name is required').max(50),
    lastName: z.string().trim().min(2, 'Last name is required').max(50),
    email: z.string().trim().email('Enter a valid email'),
    phone: z.string().trim().max(20).optional().or(z.literal('')),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    confirmPassword: z.string().min(6, 'Confirm your password'),
  })
  .refine(data => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email('Enter a valid email'),
});

export const resetPasswordSchema = z.object({
  password: z.string().min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string().min(6, 'Confirm your password'),
}).refine(data => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

export const profileSchema = z.object({
  firstName: z.string().trim().min(2, 'First name is required').max(50),
  lastName: z.string().trim().min(2, 'Last name is required').max(50),
  phone: z.string().trim().max(20).optional().or(z.literal('')),
});

export type LoginFormData = z.infer<typeof loginSchema>;
export type RegisterFormData = z.infer<typeof registerSchema>;
export type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>;
export type ProfileFormData = z.infer<typeof profileSchema>;
