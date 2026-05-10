import { EAccountType } from './steam_api';

export enum FriendRelationship {
	None = 0,
	Blocked = 1,
	RequestRecipient = 2,
	Friend = 3,
	RequestInitiator = 4,
	Ignored = 5,
	IgnoredFriend = 6,
	Suggested_DEPRECATED = 7,
	Max = 8
}

export interface SteamID {
	isAnonymous: () => boolean;
	isAnonymousGameServer: () => boolean;
	isAnonymousUser: () => boolean;
	isChatAccount: () => boolean;
	isClanAccount: () => boolean;
	isConsoleUserAccount: () => boolean;
	isContentServerAccount: () => boolean;
	isGameServerAccount: () => boolean;
	isIndividualAccount: () => boolean;
	isPersistentGameServerAccount: () => boolean;
	isLobby: () => void;
	getAccountID: () => number;
	getRawSteamID: () => string;
	getAccountType: () => EAccountType;
	isValid: () => boolean;
	getStaticAccountKey: () => string;
	getPersonaName: () => string;
	getNickname: () => string;
	getRelationship: () => FriendRelationship;
	getSteamLevel: () => number;
}
