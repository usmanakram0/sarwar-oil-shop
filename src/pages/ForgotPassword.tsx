import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import AuthLayout from '@/components/auth/AuthLayout';
import { requestPasswordReset } from '@/lib/auth';
import { forgotPasswordSchema, type ForgotPasswordFormData } from '@/lib/validation';
import { toast } from 'sonner';

export default function ForgotPassword() {
  const [resetLink, setResetLink] = useState<string | null>(null);

  const form = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = (data: ForgotPasswordFormData) => {
    const result = requestPasswordReset(data.email);
    if (result.resetToken) {
      const link = `${window.location.origin}/reset-password?token=${result.resetToken}`;
      setResetLink(link);
    }
    toast.success(result.message);
  };

  return (
    <AuthLayout title="Forgot password" subtitle="We will generate a reset link for your account">
      <Card>
        <CardContent className="pt-6 space-y-4">
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <Label>Email</Label>
              <Input type="email" {...form.register('email')} />
              {form.formState.errors.email && (
                <p className="text-xs text-destructive mt-1">{form.formState.errors.email.message}</p>
              )}
            </div>
            <Button type="submit" className="w-full">Send reset link</Button>
          </form>
          {resetLink && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs break-all space-y-2">
              <p className="font-medium text-foreground">Reset link (local demo)</p>
              <a href={resetLink} className="text-primary underline">{resetLink}</a>
            </div>
          )}
          <p className="text-center text-sm">
            <Link to="/login" className="text-primary hover:underline">Back to sign in</Link>
          </p>
        </CardContent>
      </Card>
    </AuthLayout>
  );
}


