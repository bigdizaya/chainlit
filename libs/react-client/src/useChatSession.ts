import { debounce } from 'lodash';
import { useCallback, useContext, useEffect, useRef } from 'react';
import {
  useRecoilState,
  useRecoilValue,
  useResetRecoilState,
  useSetRecoilState
} from 'recoil';
import io from 'socket.io-client';
import { toast } from 'sonner';
import {
  actionState,
  askUserState,
  audioConnectionState,
  callFnState,
  chatProfileState,
  chatSettingsInputsState,
  chatSettingsValueState,
  commandsState,
  currentThreadIdState,
  elementState,
  favoriteMessagesState,
  firstUserInteraction,
  isAiSpeakingState,
  loadingState,
  mcpState,
  messagesState,
  modesState,
  resumeThreadErrorState,
  sessionIdState,
  sessionState,
  sideViewState,
  tasklistState,
  threadHistoryState,
  threadIdToResumeState,
  tokenCountState,
  wavRecorderState,
  wavStreamPlayerState
} from 'src/state';
import {
  IAction,
  ICommand,
  IElement,
  IMessageElement,
  IMode,
  IStep,
  ITasklistElement,
  IThread
} from 'src/types';
import {
  addMessage,
  deleteMessageById,
  updateMessageById,
  updateMessageContentById
} from 'src/utils/message';

import { OutputAudioChunk } from './types/audio';

import { ChainlitContext } from './context';
import type { IToken } from './useChatData';

const FOREGROUND_SYNC_INTERVAL_MS = 2000;
const FOREGROUND_SYNC_DURATION_MS = 45000;
const THREAD_HISTORY_REFRESH_SIZE = 35;
const BAYYAN_ACTIVITY_KEY = 'jawab_last_activity';
const BAYYAN_INACTIVITY_THRESHOLD_MS = 30 * 60 * 1000;
const BAYYAN_FRESH_CHAT_URL = '/?new=1';
let foregroundSyncOwner: symbol | null = null;

function readBayyanLastActivity() {
  if (typeof window === 'undefined') return 0;

  try {
    return parseInt(
      window.localStorage.getItem(BAYYAN_ACTIVITY_KEY) || '0',
      10
    );
  } catch {
    return 0;
  }
}

function isBayyanSessionStale(now = Date.now()) {
  const lastActivity = readBayyanLastActivity();
  return (
    lastActivity > 0 && now - lastActivity > BAYYAN_INACTIVITY_THRESHOLD_MS
  );
}

function markBayyanActivity(now = Date.now()) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(BAYYAN_ACTIVITY_KEY, now.toString());
  } catch {
    // Private browsing or blocked storage should not break the app shell.
  }
}

function redirectToBayyanFreshChat() {
  if (typeof window === 'undefined') return;

  markBayyanActivity();
  if (
    window.location.pathname === '/' &&
    window.location.search.includes('new=1')
  ) {
    return;
  }
  window.location.replace(BAYYAN_FRESH_CHAT_URL);
}

function isBayyanFreshChatRequest() {
  if (typeof window === 'undefined') return false;

  try {
    return new URL(window.location.href).searchParams.get('new') === '1';
  } catch {
    return false;
  }
}

function isBayyanAuthRoute() {
  if (typeof window === 'undefined') return false;
  return (
    window.location.pathname === '/login' ||
    window.location.pathname === '/login/callback'
  );
}

function consumeBayyanFreshChatRequest() {
  if (typeof window === 'undefined') return;

  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get('new') !== '1') return;
    url.searchParams.delete('new');
    window.history.replaceState(
      window.history.state,
      '',
      `${url.pathname}${url.search}${url.hash}`
    );
  } catch {
    // URL cleanup is best-effort only.
  }
}

const useChatSession = () => {
  const client = useContext(ChainlitContext);
  const sessionId = useRecoilValue(sessionIdState);

  const [session, setSession] = useRecoilState(sessionState);
  const setIsAiSpeaking = useSetRecoilState(isAiSpeakingState);
  const setAudioConnection = useSetRecoilState(audioConnectionState);
  const resetChatSettingsValue = useResetRecoilState(chatSettingsValueState);
  const setChatSettingsValue = useSetRecoilState(chatSettingsValueState);
  const setFirstUserInteraction = useSetRecoilState(firstUserInteraction);
  const setLoading = useSetRecoilState(loadingState);
  const setMcps = useSetRecoilState(mcpState);
  const wavStreamPlayer = useRecoilValue(wavStreamPlayerState);
  const wavRecorder = useRecoilValue(wavRecorderState);
  const messages = useRecoilValue(messagesState);
  const setMessages = useSetRecoilState(messagesState);
  const setAskUser = useSetRecoilState(askUserState);
  const setCallFn = useSetRecoilState(callFnState);
  const setCommands = useSetRecoilState(commandsState);
  const setModes = useSetRecoilState(modesState);
  const setSideView = useSetRecoilState(sideViewState);
  const setElements = useSetRecoilState(elementState);
  const setTasklists = useSetRecoilState(tasklistState);
  const setActions = useSetRecoilState(actionState);
  const setChatSettingsInputs = useSetRecoilState(chatSettingsInputsState);
  const setTokenCount = useSetRecoilState(tokenCountState);
  const [chatProfile, setChatProfile] = useRecoilState(chatProfileState);
  const idToResume = useRecoilValue(threadIdToResumeState);
  const setThreadResumeError = useSetRecoilState(resumeThreadErrorState);
  const setFavoriteMessages = useSetRecoilState(favoriteMessagesState);
  const setThreadHistory = useSetRecoilState(threadHistoryState);

  const [currentThreadId, setCurrentThreadId] =
    useRecoilState(currentThreadIdState);
  const currentThreadIdRef = useRef(currentThreadId);
  const isRefreshingThreadRef = useRef(false);
  const lastForegroundRefreshRef = useRef(0);
  const foregroundSyncOwnerRef = useRef(Symbol('foreground-sync-owner'));
  const foregroundSyncTimerRef = useRef<number | undefined>(undefined);
  const messagesRef = useRef(messages);

  // Use currentThreadId as thread id in websocket header
  useEffect(() => {
    currentThreadIdRef.current = currentThreadId;
    if (session?.socket) {
      session.socket.auth['threadId'] = isBayyanFreshChatRequest()
        ? ''
        : currentThreadId || '';
    }
  }, [currentThreadId]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const applyThread = useCallback(
    (
      thread: IThread,
      options: { handleResumeRedirect?: boolean; syncLoading?: boolean } = {}
    ) => {
      const isReadOnlyView = Boolean(
        (thread as any)?.metadata?.viewer_read_only
      );
      if (
        options.handleResumeRedirect &&
        !isReadOnlyView &&
        idToResume &&
        thread.id !== idToResume
      ) {
        window.location.href = `/thread/${thread.id}`;
      }
      if (
        !isReadOnlyView &&
        (options.handleResumeRedirect ? idToResume : true)
      ) {
        currentThreadIdRef.current = thread.id;
        setCurrentThreadId(thread.id);
      }
      let messages: IStep[] = [];
      for (const step of thread.steps) {
        messages = addMessage(messages, step);
      }
      if (thread.metadata?.chat_profile) {
        setChatProfile(thread.metadata?.chat_profile);
      }
      if (thread.metadata?.chat_settings) {
        setChatSettingsValue(thread.metadata?.chat_settings);
      }
      setMessages(messages);
      const elements = thread.elements || [];
      setTasklists(
        (elements as ITasklistElement[]).filter((e) => e.type === 'tasklist')
      );
      setElements(
        (elements as IMessageElement[]).filter(
          (e) => ['avatar', 'tasklist'].indexOf(e.type) === -1
        )
      );
      if (options.syncLoading) {
        const hasStreamingStep = thread.steps.some((step) => step.streaming);
        setLoading(hasStreamingStep);
      }
    },
    [idToResume]
  );

  const updateThreadInHistory = useCallback(
    (thread: IThread) => {
      setThreadHistory((prev) => {
        const existingThreads = prev?.threads || [];
        const threadIndex = existingThreads.findIndex(
          (item) => item.id === thread.id
        );
        const nextThread = {
          ...(threadIndex >= 0 ? existingThreads[threadIndex] : {}),
          ...thread
        };
        const nextThreads =
          threadIndex >= 0
            ? existingThreads.map((item, index) =>
                index === threadIndex ? nextThread : item
              )
            : [nextThread, ...existingThreads];

        return {
          ...prev,
          currentThreadId: thread.id,
          threads: nextThreads
        };
      });
    },
    [setThreadHistory]
  );

  const refreshThreadHistory = useCallback(async () => {
    if (isBayyanAuthRoute()) return [];

    const { pageInfo, data } = await client.listThreads(
      { first: THREAD_HISTORY_REFRESH_SIZE },
      {}
    );
    setThreadHistory((prev) => ({
      ...prev,
      pageInfo,
      threads: data
    }));
    return data;
  }, [client, setThreadHistory]);

  const refreshCurrentThread = useCallback(
    async (options?: { allowRecentFallback?: boolean }) => {
      if (isRefreshingThreadRef.current) return;
      if (isBayyanAuthRoute()) return;
      if (isBayyanFreshChatRequest()) return;
      if (isBayyanSessionStale()) return;

      isRefreshingThreadRef.current = true;
      try {
        const recentThreads = await refreshThreadHistory();
        const canUseRecentFallback =
          Boolean(options?.allowRecentFallback) &&
          messagesRef.current.length > 0;
        const threadId =
          currentThreadIdRef.current ||
          idToResume ||
          (canUseRecentFallback ? recentThreads[0]?.id : undefined);
        if (!threadId) return;

        const thread = await client.getThread(threadId);
        if (isBayyanFreshChatRequest() || isBayyanSessionStale()) return;
        if (thread?.id) {
          applyThread(thread, { syncLoading: true });
          updateThreadInHistory(thread);
        }
      } catch {
        // Data persistence can be disabled, or the user may not own the thread.
        // In those cases the socket remains the source of truth.
      } finally {
        isRefreshingThreadRef.current = false;
      }
    },
    [
      applyThread,
      client,
      idToResume,
      refreshThreadHistory,
      updateThreadInHistory
    ]
  );

  useEffect(() => {
    if (typeof document === 'undefined' || typeof window === 'undefined') {
      return;
    }
    const owner = foregroundSyncOwnerRef.current;
    if (foregroundSyncOwner && foregroundSyncOwner !== owner) {
      return;
    }
    foregroundSyncOwner = owner;

    let hiddenAt = 0;

    const stopForegroundPolling = () => {
      if (foregroundSyncTimerRef.current) {
        window.clearInterval(foregroundSyncTimerRef.current);
        foregroundSyncTimerRef.current = undefined;
      }
    };

    const startForegroundPolling = () => {
      stopForegroundPolling();
      const stopAt = Date.now() + FOREGROUND_SYNC_DURATION_MS;
      foregroundSyncTimerRef.current = window.setInterval(() => {
        if (document.visibilityState !== 'visible' || Date.now() > stopAt) {
          stopForegroundPolling();
          return;
        }
        refreshCurrentThread({ allowRecentFallback: true });
      }, FOREGROUND_SYNC_INTERVAL_MS);
    };

    const handleForeground = () => {
      const now = Date.now();
      if (now - lastForegroundRefreshRef.current < 1500) return;
      lastForegroundRefreshRef.current = now;

      if (isBayyanAuthRoute()) {
        stopForegroundPolling();
        return;
      }

      if (isBayyanSessionStale(now)) {
        stopForegroundPolling();
        redirectToBayyanFreshChat();
        return;
      }
      markBayyanActivity(now);

      const freshChatRequest = isBayyanFreshChatRequest();
      const threadId = freshChatRequest
        ? ''
        : currentThreadIdRef.current || idToResume || '';
      if (session?.socket) {
        session.socket.auth['threadId'] = threadId;
        if (!session.socket.connected) {
          session.socket.connect();
        }
      }
      if (freshChatRequest) return;

      if (!hiddenAt || now - hiddenAt > 500) {
        refreshCurrentThread({ allowRecentFallback: true });
        startForegroundPolling();
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
        stopForegroundPolling();
        return;
      }
      if (document.visibilityState === 'visible') {
        handleForeground();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pageshow', handleForeground);
    window.addEventListener('focus', handleForeground);

    return () => {
      stopForegroundPolling();
      if (foregroundSyncOwner === owner) {
        foregroundSyncOwner = null;
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pageshow', handleForeground);
      window.removeEventListener('focus', handleForeground);
    };
  }, [idToResume, refreshCurrentThread, session?.socket]);

  const _connect = useCallback(
    async ({
      transports,
      userEnv
    }: {
      transports?: string[];
      userEnv: Record<string, string>;
    }) => {
      const freshChatRequest = isBayyanFreshChatRequest();
      const { protocol, host, pathname } = new URL(client.httpEndpoint);
      const uri = `${protocol}//${host}`;
      const path =
        pathname && pathname !== '/'
          ? `${pathname}/ws/socket.io`
          : '/ws/socket.io';

      try {
        await client.stickyCookie(sessionId);
      } catch (err) {
        console.error(`Failed to set sticky session cookie: ${err}`);
      }

      const socket = io(uri, {
        path,
        withCredentials: true,
        transports,
        auth: {
          clientType: client.type,
          sessionId,
          threadId: freshChatRequest ? '' : idToResume || '',
          freshChat: freshChatRequest ? '1' : '',
          userEnv: JSON.stringify(userEnv),
          chatProfile: chatProfile ? encodeURIComponent(chatProfile) : ''
        }
      });
      setSession((old) => {
        old?.socket?.removeAllListeners();
        old?.socket?.close();
        return {
          socket
        };
      });

      socket.on('connect', () => {
        if (freshChatRequest) {
          markBayyanActivity();
        }
        socket.emit('connection_successful');
        setSession((s) => ({ ...s!, error: false }));
        socket.emit('fetch_favorites');
        setMcps((prev) =>
          prev.map((mcp) => {
            let promise;
            if (mcp.clientType === 'sse') {
              promise = client.connectSseMCP(sessionId, mcp.name, mcp.url!);
            } else if (mcp.clientType === 'streamable-http') {
              promise = client.connectStreamableHttpMCP(
                sessionId,
                mcp.name,
                mcp.url!,
                mcp.headers || {}
              );
            } else {
              promise = client.connectStdioMCP(
                sessionId,
                mcp.name,
                mcp.command!
              );
            }
            promise
              .then(async ({ success, mcp }) => {
                setMcps((prev) =>
                  prev.map((existingMcp) => {
                    if (existingMcp.name === mcp.name) {
                      return {
                        ...existingMcp,
                        status: success ? 'connected' : 'failed',
                        tools: mcp ? mcp.tools : existingMcp.tools
                      };
                    }
                    return existingMcp;
                  })
                );
              })
              .catch(() => {
                setMcps((prev) =>
                  prev.map((existingMcp) => {
                    if (existingMcp.name === mcp.name) {
                      return {
                        ...existingMcp,
                        status: 'failed'
                      };
                    }
                    return existingMcp;
                  })
                );
              });
            return { ...mcp, status: 'connecting' };
          })
        );
      });

      socket.on('connect_error', (_) => {
        setSession((s) => ({ ...s!, error: true }));
      });

      socket.on('disconnect', async () => {
        setAudioConnection('off');
        setIsAiSpeaking(false);
        try {
          await wavRecorder.end();
        } catch {
          // Best-effort cleanup after mobile background disconnects.
        }
        try {
          await wavStreamPlayer.interrupt();
        } catch {
          // Player may already be disconnected.
        }
      });

      socket.on('task_start', () => {
        setLoading(true);
      });

      socket.on('task_end', () => {
        setLoading(false);
        refreshCurrentThread();
      });

      socket.on('reload', () => {
        socket.emit('clear_session');
        window.location.reload();
      });

      socket.on('audio_connection', async (state: 'on' | 'off') => {
        if (state === 'on') {
          let isFirstChunk = true;
          const startTime = Date.now();
          const mimeType = 'pcm16';
          try {
            if (
              typeof wavRecorder.getStatus === 'function' &&
              wavRecorder.getStatus() !== 'ended'
            ) {
              await wavRecorder.end();
            }
            await wavRecorder.begin();
            await wavStreamPlayer.connect();
            if (typeof wavRecorder.resume === 'function') {
              await wavRecorder.resume();
            }
            await wavRecorder.record(async (data) => {
              const elapsedTime = Date.now() - startTime;
              socket.emit('audio_chunk', {
                isStart: isFirstChunk,
                mimeType,
                elapsedTime,
                data: data.mono
              });
              isFirstChunk = false;
            });
            wavStreamPlayer.onStop = () => setIsAiSpeaking(false);
          } catch {
            try {
              await wavRecorder.end();
            } catch {
              // ignored
            }
            await wavStreamPlayer.interrupt();
            socket.emit('audio_end');
            setAudioConnection('off');
            return;
          }
        } else {
          try {
            await wavRecorder.end();
          } catch {
            // Recorder may already be cleaned up.
          }
          try {
            await wavStreamPlayer.interrupt();
          } catch {
            // Player may already be disconnected.
          }
          setIsAiSpeaking(false);
        }
        setAudioConnection(state);
      });

      socket.on('audio_chunk', (chunk: OutputAudioChunk) => {
        wavStreamPlayer.add16BitPCM(chunk.data, chunk.track);
        setIsAiSpeaking(true);
      });

      socket.on('audio_interrupt', () => {
        wavStreamPlayer.interrupt();
      });

      socket.on('resume_thread', (thread: IThread) => {
        if (freshChatRequest || isBayyanFreshChatRequest()) {
          return;
        }
        applyThread(thread, { handleResumeRedirect: true });
      });

      socket.on('resume_thread_error', (error?: string) => {
        setThreadResumeError(error);
      });

      socket.on('new_message', (message: IStep) => {
        setMessages((oldMessages) => addMessage(oldMessages, message));
      });

      socket.on(
        'first_interaction',
        (event: { interaction: string; thread_id: string }) => {
          if (
            event.interaction === 'resume' &&
            (freshChatRequest || isBayyanFreshChatRequest())
          ) {
            return;
          }
          if (freshChatRequest || isBayyanFreshChatRequest()) {
            markBayyanActivity();
            consumeBayyanFreshChatRequest();
          }
          setFirstUserInteraction(event.interaction);
          currentThreadIdRef.current = event.thread_id;
          setCurrentThreadId(event.thread_id);
        }
      );

      socket.on('update_message', (message: IStep) => {
        setMessages((oldMessages) =>
          updateMessageById(oldMessages, message.id, message)
        );
      });

      socket.on('delete_message', (message: IStep) => {
        setMessages((oldMessages) =>
          deleteMessageById(oldMessages, message.id)
        );
      });

      socket.on('stream_start', (message: IStep) => {
        setMessages((oldMessages) => addMessage(oldMessages, message));
      });

      socket.on(
        'stream_token',
        ({ id, token, isSequence, isInput }: IToken) => {
          setMessages((oldMessages) =>
            updateMessageContentById(
              oldMessages,
              id,
              token,
              isSequence,
              isInput
            )
          );
        }
      );

      socket.on('ask', ({ msg, spec }, callback) => {
        setAskUser({ spec, callback, parentId: msg.parentId });
        setMessages((oldMessages) => addMessage(oldMessages, msg));

        setLoading(false);
      });

      socket.on('ask_timeout', () => {
        setAskUser(undefined);
        setLoading(false);
      });

      socket.on('clear_ask', () => {
        setAskUser(undefined);
      });

      socket.on('call_fn', ({ name, args }, callback) => {
        setCallFn({ name, args, callback });
      });

      socket.on('clear_call_fn', () => {
        setCallFn(undefined);
      });

      socket.on('call_fn_timeout', () => {
        setCallFn(undefined);
      });

      socket.on('chat_settings', (inputs: any) => {
        setChatSettingsInputs(inputs);
        resetChatSettingsValue();
      });

      socket.on('set_commands', (commands: ICommand[]) => {
        setCommands(commands);
      });

      socket.on('set_modes', (modes: IMode[]) => {
        setModes(modes);
      });

      socket.on('set_favorites', (steps: IStep[]) => {
        setFavoriteMessages(steps);
      });

      socket.on('set_sidebar_title', (title: string) => {
        setSideView((prev) => {
          if (prev?.title === title) return prev;
          return { title, elements: prev?.elements || [] };
        });
      });

      socket.on(
        'set_sidebar_elements',
        ({ elements, key }: { elements: IMessageElement[]; key?: string }) => {
          if (!elements.length) {
            setSideView(undefined);
          } else {
            elements.forEach((element) => {
              if (!element.url && element.chainlitKey) {
                element.url = client.getElementUrl(
                  element.chainlitKey,
                  sessionId
                );
              }
            });
            setSideView((prev) => {
              if (prev?.key === key) return prev;
              return { title: prev?.title || '', elements: elements, key };
            });
          }
        }
      );

      socket.on('element', (element: IElement) => {
        if (!element.url && element.chainlitKey) {
          element.url = client.getElementUrl(element.chainlitKey, sessionId);
        }

        if (element.type === 'tasklist') {
          setTasklists((old) => {
            const index = old.findIndex((e) => e.id === element.id);
            if (index === -1) {
              return [...old, element];
            } else {
              return [...old.slice(0, index), element, ...old.slice(index + 1)];
            }
          });
        } else {
          setElements((old) => {
            const index = old.findIndex((e) => e.id === element.id);
            if (index === -1) {
              return [...old, element];
            } else {
              return [...old.slice(0, index), element, ...old.slice(index + 1)];
            }
          });
        }
      });

      socket.on('remove_element', (remove: { id: string }) => {
        setElements((old) => {
          return old.filter((e) => e.id !== remove.id);
        });
        setTasklists((old) => {
          return old.filter((e) => e.id !== remove.id);
        });
      });

      socket.on('action', (action: IAction) => {
        setActions((old) => [...old, action]);
      });

      socket.on('remove_action', (action: IAction) => {
        setActions((old) => {
          const index = old.findIndex((a) => a.id === action.id);
          if (index === -1) return old;
          return [...old.slice(0, index), ...old.slice(index + 1)];
        });
      });

      socket.on('token_usage', (count: number) => {
        setTokenCount((old) => old + count);
      });

      socket.on('window_message', (data: any) => {
        if (window.parent) {
          window.parent.postMessage(data, '*');
        }
      });

      socket.on('toast', (data: { message: string; type: string }) => {
        if (!data.message) {
          console.warn('No message received for toast.');
          return;
        }

        switch (data.type) {
          case 'info':
            toast.info(data.message);
            break;
          case 'error':
            toast.error(data.message);
            break;
          case 'success':
            toast.success(data.message);
            break;
          case 'warning':
            toast.warning(data.message);
            break;
          default:
            toast(data.message);
            break;
        }
      });
    },
    [
      setSession,
      sessionId,
      idToResume,
      chatProfile,
      applyThread,
      refreshCurrentThread
    ]
  );

  const connect = useCallback(debounce(_connect, 200), [_connect]);

  const disconnect = useCallback(() => {
    if (session?.socket) {
      session.socket.removeAllListeners();
      session.socket.close();
    }
  }, [session]);

  return {
    connect,
    disconnect,
    session,
    sessionId,
    chatProfile,
    idToResume,
    setChatProfile
  };
};

export { useChatSession };
