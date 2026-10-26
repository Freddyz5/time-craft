// Who: the household, its parents and children, and the activities that use
// up the quota. Ids are the uuids of the domain tables; auth_user ids are
// Better Auth's text ids.

// 0 = Sunday, 1 = Monday ... 6 = Saturday (same as Date#getDay).
export type WeekDay = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface Family {
	id: string;
	name: string;
	timezone: string;
	weekStartDay: WeekDay;
	requestExpiryMinutes: number;
	autoCloseAfterMinutes: number;
	recoveryCodeHash: string | null;
	recoveryCodeCreatedAt: Date | null;
}

export interface Parent {
	id: string;
	familyId: string;
	authUserId: string;
	name: string;
}

export interface Child {
	id: string;
	familyId: string;
	authUserId: string;
	name: string;
	avatar: string | null;
	failedPinAttempts: number;
	lockedUntil: Date | null;
	createdAt: Date;
}

export interface Activity {
	id: string;
	familyId: string;
	code: string;
	name: string;
	isActive: boolean;
}
