export interface ChatUser {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  avatarUrl?: string | null;
}

export interface ChatReaction {
  emoji: string;
  count: number;
  mine: boolean;
}

export interface ChatReplyPreview {
  id: string;
  type: string;
  body: string;
  senderName: string;
  deleted?: boolean;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  type: string;
  body: string;
  attachmentUrl?: string | null;
  createdAt: string;
  sender?: ChatUser;
  tempId?: string;
  pending?: boolean;
  failed?: boolean;
  status?: "sent" | "delivered" | "read";
  replyToId?: string | null;
  replyTo?: ChatReplyPreview | null;
  reactions?: ChatReaction[];
  forwarded?: boolean;
  deleted?: boolean;
}

export interface ChatParticipant {
  userId: string;
  role: string;
  user: ChatUser;
}

export interface Conversation {
  id: string;
  isGroup: boolean;
  title?: string | null;
  avatarUrl?: string | null;
  createdBy?: string;
  lastMessageAt: string;
  participants: ChatParticipant[];
  lastMessage?: ChatMessage | null;
  unread: number;
}

export function convTitle(c: Conversation, meId: string): string {
  if (c.isGroup) return c.title || "Grup";
  const other = c.participants.find((p) => p.userId !== meId);
  return other ? `${other.user.firstName} ${other.user.lastName}`.trim() : "Sohbet";
}

// Ham reaksiyon ({emoji, userIds}) → görünüm ({emoji, count, mine}) (canlı güncellemede kullanılır)
export function groupReactions(raw: { emoji: string; userIds: string[] }[], meId: string): ChatReaction[] {
  return (raw || []).map((r) => ({ emoji: r.emoji, count: r.userIds.length, mine: r.userIds.includes(meId) }));
}

export function convAvatar(c: Conversation, meId: string): string | null {
  if (c.isGroup) return c.avatarUrl || null;
  const other = c.participants.find((p) => p.userId !== meId);
  return other?.user.avatarUrl || null;
}

export function initials(u?: ChatUser): string {
  if (!u) return "?";
  return `${(u.firstName || "")[0] || ""}${(u.lastName || "")[0] || ""}`.toUpperCase() || "?";
}
