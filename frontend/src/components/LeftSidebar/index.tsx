import { useNavigate } from 'react-router-dom';

import { useBayyanLocale } from '@chainlit/react-client';

import SidebarTrigger from '@/components/header/SidebarTrigger';
import { Sidebar, SidebarHeader, SidebarRail } from '@/components/ui/sidebar';

import NewChatButton from '../header/NewChat';
import SearchChats from './Search';
import { ThreadHistory } from './ThreadHistory';

export default function LeftSidebar({
  ...props
}: React.ComponentProps<typeof Sidebar>) {
  const navigate = useNavigate();
  const { locale } = useBayyanLocale();
  return (
    <Sidebar
      side={locale === 'ar' ? 'right' : 'left'}
      {...props}
      className="border-none"
    >
      <SidebarHeader className="bayyan-sidebar-header py-3">
        <div className="flex items-center justify-between">
          <SidebarTrigger />
          <div className="flex items-center">
            <SearchChats />
            <NewChatButton navigate={navigate} />
          </div>
        </div>
      </SidebarHeader>
      <ThreadHistory />
      <SidebarRail />
    </Sidebar>
  );
}
