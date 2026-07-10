/**
 * Make the fresh-chat socket hint one-shot once the server has assigned a
 * thread. Socket.IO reuses this mutable auth object during mobile reconnects.
 */
export function bindBayyanFreshChatToThread(
  auth: unknown,
  threadId: string
): boolean {
  if (!auth || typeof auth !== 'object') {
    return false;
  }

  const mutableAuth = auth as Record<string, unknown>;
  mutableAuth.threadId = threadId;
  mutableAuth.freshChat = '';
  return true;
}
