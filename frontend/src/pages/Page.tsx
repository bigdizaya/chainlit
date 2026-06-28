import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useRecoilValue, useSetRecoilState } from 'recoil';

import { sideViewState, useAuth, useConfig } from '@chainlit/react-client';

import ChatSettingsSidebar from '@/components/ChatSettings/ChatSettingsSidebar';
import ElementSideView from '@/components/ElementSideView';
import LeftSidebar from '@/components/LeftSidebar';
import { TaskList } from '@/components/Tasklist';
import { Header } from '@/components/header';
import QuotaBar from '@/components/header/QuotaBar';
import { ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';

import { normalizeQuotaPayload, quotaState } from '@/state/quota';
import { userEnvState } from 'state/user';

type Props = {
  children: JSX.Element;
};

const Page = ({ children }: Props) => {
  const { config } = useConfig();
  const { data } = useAuth();
  const userEnv = useRecoilValue(userEnvState);
  const sideView = useRecoilValue(sideViewState);
  const setQuota = useSetRecoilState(quotaState);

  const isLoggedIn = !!data?.requireLogin;

  // Charger le quota au montage
  useEffect(() => {
    if (!isLoggedIn) return;

    fetch('/api/quota', {
      method: 'POST',
      credentials: 'include'
    })
      .then((res) => res.json())
      .then((data) => {
        const quota = normalizeQuotaPayload(data);
        if (data.success && quota) {
          setQuota(quota);
        }
      })
      .catch(() => {
        // Silently fail — quota bar will just not show
      });
  }, [isLoggedIn, setQuota]);

  // Écouter les mises à jour de quota en temps réel via window messages
  useEffect(() => {
    if (!isLoggedIn) return;

    const applyQuotaMessage = (msg: unknown) => {
      if (!msg || typeof msg !== 'object') return;
      const record = msg as Record<string, unknown>;
      if (record.type === 'quota_update') {
        const quota = normalizeQuotaPayload(record);
        if (quota) setQuota(quota);
      }
    };

    const handleMessage = (event: MessageEvent) => {
      applyQuotaMessage(event.data);
    };

    const handleWindowMessage = (event: Event) => {
      const data = event instanceof CustomEvent ? event.detail : undefined;
      applyQuotaMessage(data);
    };

    window.addEventListener('message', handleMessage);
    window.addEventListener('chainlit:window_message', handleWindowMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
      window.removeEventListener(
        'chainlit:window_message',
        handleWindowMessage
      );
    };
  }, [isLoggedIn, setQuota]);

  if (config?.userEnv) {
    for (const key of config.userEnv || []) {
      if (!userEnv[key]) return <Navigate to="/env" />;
    }
  }

  const showSettingsSidebar = config?.ui?.chat_settings_location === 'sidebar';

  const mainContent = (
    <div className="flex flex-col h-full w-full">
      <Header />
      {isLoggedIn && <QuotaBar />}
      <ResizablePanelGroup
        direction="horizontal"
        className="flex flex-row flex-grow"
      >
        <ResizablePanel
          className="flex flex-col h-full w-full"
          minSize={40}
          defaultSize={60}
        >
          <div className="flex flex-row flex-grow overflow-auto">
            {children}
          </div>
        </ResizablePanel>
        {sideView ? <ElementSideView /> : <TaskList isMobile={false} />}
        {showSettingsSidebar && <ChatSettingsSidebar />}
      </ResizablePanelGroup>
    </div>
  );

  const historyEnabled = config?.dataPersistence && data?.requireLogin;
  const sidebarHidden = config?.ui?.default_sidebar_state === 'hidden';

  return (
    <SidebarProvider
      defaultOpen={config?.ui.default_sidebar_state !== 'closed'}
    >
      {historyEnabled && !sidebarHidden ? (
        <>
          <LeftSidebar />
          <SidebarInset className="h-dvh max-h-dvh min-h-0 min-w-0">
            {mainContent}
          </SidebarInset>
        </>
      ) : (
        <div className="h-dvh w-screen flex">{mainContent}</div>
      )}
    </SidebarProvider>
  );
};

export default Page;
