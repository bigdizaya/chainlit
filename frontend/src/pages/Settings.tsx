import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Loader2, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'components/i18n/Translator';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';

import { useAuth } from '@chainlit/react-client';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

import { useLayoutMaxWidth } from '@/hooks/useLayoutMaxWidth';

// ---------- Types ----------

interface Profile {
  id: string;
  email: string;
  username: string;
  auth_provider: 'credentials' | 'google' | 'apple' | 'both';
  has_password: boolean;
  created_at?: string;
}

// ---------- API helpers ----------

async function fetchSessionToken(): Promise<string | null> {
  try {
    const res = await fetch('/api/auth/session-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include'
    });
    const data = await res.json();
    return data.success && data.token ? data.token : null;
  } catch {
    return null;
  }
}

async function fetchProfile(token: string | null): Promise<Profile | null> {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch('/api/profile', {
      method: 'POST',
      headers,
      credentials: 'include'
    });
    const data = await res.json();
    return data.success && data.profile ? data.profile : null;
  } catch {
    return null;
  }
}

async function apiCall(
  endpoint: string,
  body: Record<string, string>,
  token: string | null
): Promise<{ success: boolean; message?: string }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify(body)
  });
  return res.json();
}

// ---------- Component ----------

const Settings = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useTranslation();
  const layoutMaxWidth = useLayoutMaxWidth();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Load profile on mount
  useEffect(() => {
    (async () => {
      const jwt = await fetchSessionToken();
      setToken(jwt);
      const p = await fetchProfile(jwt);
      if (p) {
        setProfile(p);
      } else {
        setError(true);
      }
      setLoading(false);
    })();
  }, []);

  if (!user) {
    navigate('/login');
    return null;
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center flex-grow gap-2">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-muted-foreground">{t('common.status.loading')}</p>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="flex flex-col items-center justify-center flex-grow gap-4">
        <p className="text-destructive">
          {t('common.status.error.serverConnection')}
        </p>
        <Button variant="outline" onClick={() => navigate('/')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t('settings.back')}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-grow overflow-y-auto">
      <div
        className="flex flex-col flex-grow gap-4 mx-auto w-full p-4"
        style={{ maxWidth: layoutMaxWidth }}
      >
        {/* Back button */}
        <Button
          variant="ghost"
          className="self-start -ml-2"
          onClick={() => navigate('/')}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t('settings.back')}
        </Button>

        {/* Title */}
        <div>
          <h1 className="text-2xl font-bold">{t('settings.title')}</h1>
          <p className="text-muted-foreground">{t('settings.subtitle')}</p>
        </div>

        {/* Profile info */}
        <ProfileCard profile={profile} />

        {/* Username form */}
        <UsernameCard
          profile={profile}
          token={token}
          onUpdate={(name) =>
            setProfile((p) => (p ? { ...p, username: name } : p))
          }
        />

        {/* Account deletion */}
        <DeleteAccountCard
          profile={profile}
          token={token}
          onDeleted={() => navigate('/login?account_deleted=1')}
        />

        {/* Password section */}
        {profile.has_password ? (
          <ChangePasswordCard token={token} />
        ) : (
          <SetPasswordCard
            profile={profile}
            token={token}
            onSet={() =>
              setProfile((p) => (p ? { ...p, has_password: true } : p))
            }
          />
        )}

        {/* Bottom spacing */}
        <div className="h-8" />
      </div>
    </div>
  );
};

// ---------- Profile Card ----------

function ProfileCard({ profile }: { profile: Profile }) {
  const { t } = useTranslation();

  const providerLabel =
    profile.auth_provider === 'credentials'
      ? t('settings.profile.providerCredentials')
      : profile.auth_provider === 'google'
        ? t('settings.profile.providerGoogle')
        : profile.auth_provider === 'apple'
          ? t('settings.profile.providerApple')
          : t('settings.profile.providerBoth');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">
          {t('settings.profile.title')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex justify-between">
          <span className="text-muted-foreground">
            {t('settings.profile.email')}
          </span>
          <span className="font-medium">{profile.email}</span>
        </div>
        <Separator />
        <div className="flex justify-between">
          <span className="text-muted-foreground">
            {t('settings.profile.provider')}
          </span>
          <span className="font-medium">{providerLabel}</span>
        </div>
        {profile.created_at && (
          <>
            <Separator />
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {t('settings.profile.createdAt')}
              </span>
              <span className="font-medium">
                {new Date(profile.created_at).toLocaleDateString()}
              </span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- Delete Account Card ----------

function DeleteAccountCard({
  profile,
  token,
  onDeleted
}: {
  profile: Profile;
  token: string | null;
  onDeleted: () => void;
}) {
  const { t } = useTranslation();

  const schema = z.object({
    password: profile.has_password
      ? z.string().min(1, t('settings.delete.errors.required'))
      : z.string().optional()
  });

  type FormValues = z.infer<typeof schema>;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<FormValues>({
    defaultValues: { password: '' },
    resolver: zodResolver(schema)
  });

  const onSubmit = useCallback(
    async (values: FormValues) => {
      const confirmed = window.confirm(t('settings.delete.confirm'));
      if (!confirmed) return;

      const res = await apiCall(
        '/api/user/delete-account',
        {
          password: profile.has_password
            ? values.password || ''
            : 'CONFIRM_DELETE_OAUTH'
        },
        token
      );

      if (res.success) {
        toast.success(t('settings.delete.success'));
        onDeleted();
      } else {
        toast.error(res.message || t('common.status.error.default'));
      }
    },
    [profile.has_password, token, onDeleted, t]
  );

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="text-lg text-destructive">
          {t('settings.delete.title')}
        </CardTitle>
        <CardDescription>{t('settings.delete.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {profile.has_password ? (
            <div className="space-y-2">
              <Label htmlFor="deleteAccountPassword">
                {t('settings.delete.passwordLabel')}
              </Label>
              <Input
                id="deleteAccountPassword"
                type="password"
                autoComplete="current-password"
                {...register('password')}
                className={errors.password ? 'border-destructive' : ''}
              />
              {errors.password && (
                <p className="text-sm text-destructive">
                  {errors.password.message}
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t('settings.delete.oauthHint')}
            </p>
          )}

          <Button type="submit" variant="destructive" disabled={isSubmitting}>
            {isSubmitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="mr-2 h-4 w-4" />
            )}
            {t('settings.delete.button')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

// ---------- Username Card ----------

function UsernameCard({
  profile,
  token,
  onUpdate
}: {
  profile: Profile;
  token: string | null;
  onUpdate: (name: string) => void;
}) {
  const { t } = useTranslation();

  const schema = z.object({
    username: z
      .string()
      .min(1, t('settings.username.errors.required'))
      .min(2, t('settings.username.errors.minLength'))
      .regex(/^[\w\s-]+$/u, t('settings.username.errors.pattern'))
  });

  type FormValues = z.infer<typeof schema>;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<FormValues>({
    defaultValues: { username: profile.username || '' },
    resolver: zodResolver(schema)
  });

  const onSubmit = useCallback(
    async (values: FormValues) => {
      const res = await apiCall(
        '/api/profile/update-username',
        { username: values.username },
        token
      );
      if (res.success) {
        toast.success(t('settings.username.success'));
        onUpdate(values.username);
      } else {
        toast.error(res.message || t('common.status.error.default'));
      }
    },
    [token, onUpdate, t]
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">
          {t('settings.username.title')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">{t('settings.username.label')}</Label>
            <Input
              id="username"
              placeholder={t('settings.username.placeholder')}
              maxLength={50}
              {...register('username')}
              className={errors.username ? 'border-destructive' : ''}
            />
            {errors.username && (
              <p className="text-sm text-destructive">
                {errors.username.message}
              </p>
            )}
          </div>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            {t('settings.username.save')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

// ---------- Change Password Card ----------

function ChangePasswordCard({ token }: { token: string | null }) {
  const { t } = useTranslation();

  const schema = z
    .object({
      currentPassword: z
        .string()
        .min(1, t('settings.password.errors.required')),
      newPassword: z
        .string()
        .min(8, t('settings.password.errors.minLength'))
        .regex(
          /(?=.*[a-zA-Z\u0600-\u06FF])(?=.*\d)/,
          t('settings.password.errors.pattern')
        ),
      confirmPassword: z.string()
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
      message: t('settings.password.errors.mismatch'),
      path: ['confirmPassword']
    });

  type FormValues = z.infer<typeof schema>;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting }
  } = useForm<FormValues>({
    resolver: zodResolver(schema)
  });

  const onSubmit = useCallback(
    async (values: FormValues) => {
      const res = await apiCall(
        '/api/profile/change-password',
        {
          current_password: values.currentPassword,
          new_password: values.newPassword
        },
        token
      );
      if (res.success) {
        toast.success(t('settings.password.changeSuccess'));
        reset();
      } else {
        toast.error(res.message || t('common.status.error.default'));
      }
    },
    [token, reset, t]
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">
          {t('settings.password.changeTitle')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="currentPassword">
              {t('settings.password.currentLabel')}
            </Label>
            <Input
              id="currentPassword"
              type="password"
              autoComplete="current-password"
              {...register('currentPassword')}
              className={errors.currentPassword ? 'border-destructive' : ''}
            />
            {errors.currentPassword && (
              <p className="text-sm text-destructive">
                {errors.currentPassword.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="newPassword">
              {t('settings.password.newLabel')}
            </Label>
            <Input
              id="newPassword"
              type="password"
              autoComplete="new-password"
              {...register('newPassword')}
              className={errors.newPassword ? 'border-destructive' : ''}
            />
            {errors.newPassword && (
              <p className="text-sm text-destructive">
                {errors.newPassword.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">
              {t('settings.password.confirmLabel')}
            </Label>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              {...register('confirmPassword')}
              className={errors.confirmPassword ? 'border-destructive' : ''}
            />
            {errors.confirmPassword && (
              <p className="text-sm text-destructive">
                {errors.confirmPassword.message}
              </p>
            )}
          </div>

          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            {t('settings.password.change')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

// ---------- Set Password Card (OAuth users) ----------

function SetPasswordCard({
  profile,
  token,
  onSet
}: {
  profile: Profile;
  token: string | null;
  onSet: () => void;
}) {
  const { t } = useTranslation();

  const schema = z
    .object({
      newPassword: z
        .string()
        .min(8, t('settings.password.errors.minLength'))
        .regex(
          /(?=.*[a-zA-Z\u0600-\u06FF])(?=.*\d)/,
          t('settings.password.errors.pattern')
        ),
      confirmPassword: z.string()
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
      message: t('settings.password.errors.mismatch'),
      path: ['confirmPassword']
    });

  type FormValues = z.infer<typeof schema>;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting }
  } = useForm<FormValues>({
    resolver: zodResolver(schema)
  });

  const onSubmit = useCallback(
    async (values: FormValues) => {
      const res = await apiCall(
        '/api/auth/set-password',
        { user_id: profile.id, password: values.newPassword },
        token
      );
      if (res.success) {
        toast.success(t('settings.password.setSuccess'));
        reset();
        onSet();
      } else {
        toast.error(res.message || t('common.status.error.default'));
      }
    },
    [token, profile.id, reset, onSet, t]
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">
          {t('settings.password.setTitle')}
        </CardTitle>
        <CardDescription>
          {t('settings.password.setDescription')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="setNewPassword">
              {t('settings.password.newLabel')}
            </Label>
            <Input
              id="setNewPassword"
              type="password"
              autoComplete="new-password"
              {...register('newPassword')}
              className={errors.newPassword ? 'border-destructive' : ''}
            />
            {errors.newPassword && (
              <p className="text-sm text-destructive">
                {errors.newPassword.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="setConfirmPassword">
              {t('settings.password.confirmLabel')}
            </Label>
            <Input
              id="setConfirmPassword"
              type="password"
              autoComplete="new-password"
              {...register('confirmPassword')}
              className={errors.confirmPassword ? 'border-destructive' : ''}
            />
            {errors.confirmPassword && (
              <p className="text-sm text-destructive">
                {errors.confirmPassword.message}
              </p>
            )}
          </div>

          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            {t('settings.password.set')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export default Settings;
