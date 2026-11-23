import type { MessageView } from './messages';
/** Shared types for friends, follows, blocks, presence and the activity feed. */

export interface SocialUser {
  id: string;
  username: string;
  displayName: string;
  country: string | null;
}

export type PresenceStatus = 'offline' | 'online' | 'playing';

export interface Presence {
  status: PresenceStatus;
  /** Set while playing, so friends can spectate. */
  gameId?: string;
}

/** How the viewer relates to another user. */
export interface Relationship {
  friend: boolean;
  /** A friend request is pending: "incoming" (they asked you) or "outgoing" (you asked them). */
  request: 'incoming' | 'outgoing' | null;
  following: boolean;
  followsYou: boolean;
  blocked: boolean;
}

export interface UserWithRelationship extends SocialUser {
  relationship: Relationship;
}

export interface FriendEntry {
  user: SocialUser;
  presence: Presence;
  since: number;
}

export interface FriendRequestEntry {
  user: SocialUser;
  createdAt: number;
}

export interface LiveGameEntry {
  gameId: string;
  white: SocialUser & { rating: number };
  black: SocialUser & { rating: number };
  timeControl: { initialMs: number; incrementMs: number };
  rated: boolean;
  startedAt: number;
}

export type FeedItem =
  | {
      id: string;
      kind: 'game';
      at: number;
      gameId: string;
      white: SocialUser;
      black: SocialUser;
      /** "1-0", "0-1" or "1/2-1/2". */
      result: string;
      reason: string;
      category: string;
      rated: boolean;
    }
  | { id: string; kind: 'friendship'; at: number; a: SocialUser; b: SocialUser }
  | { id: string; kind: 'follow'; at: number; follower: SocialUser; followee: SocialUser };

/** Realtime social notifications pushed over the game WebSocket. */
export type SocialEvent =
  | { kind: 'friendRequest'; from: SocialUser }
  | { kind: 'friendAccepted'; by: SocialUser }
  | { kind: 'friendRemoved'; userId: string }
  /** A new direct message (or staff message) for the viewer, or one the viewer sent from another device. */
  | { kind: 'message'; message: MessageView; from: SocialUser | null; unread: number };

export const SOCIAL_LIMITS = {
  /** Pending outgoing friend requests a user may have at once. */
  maxOutgoingRequests: 50,
  maxFriends: 1000,
  searchResults: 20,
  feedPage: 30,
} as const;
