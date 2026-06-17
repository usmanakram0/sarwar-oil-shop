import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import AuthLayout from '@/components/auth/AuthLayout';
import PasswordInput from '@/components/auth/PasswordInput';
import { resetPassword } from '@/lib/auth';
import { resetPasswordSchema, type ResetPasswordFormData } from '@/lib/validation';
import { toast } from 'sonner';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') || '';
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  if (!token) {
    return (
      <AuthLayout title="Invalid link" subtitle="This reset link is missing or invalid">
        <Card>
          <CardContent className="pt-6 text-center space-y-4">
            <p className="text-sm text-muted-foreground">Request a new password reset from the sign-in page.</p>
            <Button asChild><Link to="/forgot-password">Forgot password</Link></Button>
          </CardContent>
        </Card>
      </AuthLayout>
    );
  }

  const onSubmit = (data: ResetPasswordFormData) => {
    setSubmitting(true);
    const result = resetPassword(token, data.password);
    setSubmitting(false);
    if (result.success) {
      toast.success(result.message);
      navigate('/login', { replace: true });
    } else {
      toast.error(result.message);
    }
  };

  return (
    <AuthLayout title="Set new password" subtitle="Choose a strong password for your account">
      <Card>
        <CardContent className="pt-6 space-y-4">
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <Label>New password</Label>
              <PasswordInput autoComplete="new-password" {...form.register('password')} />
              {form.formState.errors.password && (
                <p className="text-xs text-destructive mt-1">{form.formState.errors.password.message}</p>
              )}
            </div>
            <div>
              <Label>Confirm password</Label>
              <PasswordInput autoComplete="new-password" {...form.register('confirmPassword')} />
              {form.formState.errors.confirmPassword && (
                <p className="text-xs text-destructive mt-1">{form.formState.errors.confirmPassword.message}</p>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Saving...' : 'Update password'}
            </Button>
          </form>
          <p className="text-center text-sm">
            <Link to="/login" className="text-primary hover:underline">Back to sign in</Link>
          </p>
        </CardContent>
      </Card>
    </AuthLayout>
  );
}

