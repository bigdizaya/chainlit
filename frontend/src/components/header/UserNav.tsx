import capitalize from 'lodash/capitalize';
import { Languages, LogOut, Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import {
  BAYYAN_LOCALES,
  useAuth,
  useBayyanLocale,
  useChatInteract
} from '@chainlit/react-client';
import type { BayyanLocale } from '@chainlit/react-client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Translator } from 'components/i18n';
import { useTranslation } from 'components/i18n/Translator';

export default function UserNav() {
  const { user, logout } = useAuth();
  const { clear } = useChatInteract();
  const navigate = useNavigate();
  const { locale, setLocale } = useBayyanLocale();
  const { t } = useTranslation();

  const handleLogout = async () => {
    clear();
    await logout(false);
    window.location.assign('/login');
  };

  if (!user) return null;
  const displayName = user?.display_name || user?.identifier;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          id="user-nav-button"
          variant="ghost"
          className="relative h-8 w-8 rounded-full"
        >
          <Avatar className="h-8 w-8">
            <AvatarImage
              src={user?.metadata.image}
              alt={t('bayyan.navigation.userImage')}
            />
            <AvatarFallback className="bg-primary text-primary-foreground font-semibold">
              {capitalize(displayName[0])}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-26" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{displayName}</p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate('/settings')}>
          <Translator path="navigation.user.menu.settings" />
          <Settings className="ml-auto" />
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Languages />
            <span>{t('bayyan.language.label')}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="min-w-36">
            <DropdownMenuRadioGroup
              value={locale}
              onValueChange={(value) => setLocale(value as BayyanLocale)}
            >
              {BAYYAN_LOCALES.map((option) => (
                <DropdownMenuRadioItem key={option} value={option}>
                  {t(`bayyan.language.${option}`)}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout}>
          <Translator path="navigation.user.menu.logout" />
          <LogOut className="ml-auto" />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
