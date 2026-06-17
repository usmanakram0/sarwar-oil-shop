import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useAuth } from '@/contexts/AuthContext';
import { profileSchema, type ProfileFormData } from '@/lib/validation';
import { toast } from 'sonner';

export default function Profile() {
  const { session, avatarInitials, updateProfile } = useAuth();

  const form = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      firstName: session?.firstName ?? '',
      lastName: session?.lastName ?? '',
      phone: session?.phone ?? '',
    },
  });

  useEffect(() => {
    if (session) {
      form.reset({
        firstName: session.firstName,
        lastName: session.lastName,
        phone: session.phone,
      });
    }
  }, [session, form]);

  const onSubmit = (data: ProfileFormData) => {
    const result = updateProfile(data);
    if (result.success) {
      toast.success('Profile updated');
    } else {
      toast.error(result.message);
    }
  };

  if (!session) return null;

  return (
    <div className="space-y-6 pb-16 lg:pb-0 animate-fade-in max-w-lg">
      <h1 className="text-2xl font-heading font-bold">My Profile</h1>

      <Card>
        <CardContent className="pt-6 flex items-center gap-4">
          <Avatar className="h-16 w-16">
            <AvatarFallback className="bg-primary text-primary-foreground text-lg font-heading">
              {avatarInitials}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="font-heading font-semibold text-lg">
              {session.firstName} {session.lastName}
            </p>
            <p className="text-sm text-muted-foreground">{session.email}</p>
            <p className="text-xs text-muted-foreground mt-1">Store ID: {session.tenantId}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-heading">Edit profile</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <Label>Email</Label>
              <Input value={session.email} disabled className="bg-muted" />
              <p className="text-xs text-muted-foreground mt-1">Email cannot be changed</p>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Label>First name *</Label>
                <Input {...form.register('firstName')} />
                {form.formState.errors.firstName && (
                  <p className="text-xs text-destructive mt-1">{form.formState.errors.firstName.message}</p>
                )}
              </div>
              <div>
                <Label>Last name *</Label>
                <Input {...form.register('lastName')} />
                {form.formState.errors.lastName && (
                  <p className="text-xs text-destructive mt-1">{form.formState.errors.lastName.message}</p>
                )}
              </div>
            </div>
            <div>
              <Label>Phone</Label>
              <Input {...form.register('phone')} />
            </div>
            <Button type="submit">Save changes</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}


