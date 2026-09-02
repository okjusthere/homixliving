type SessionUpdater<Session> = (data?: unknown) => Promise<Session | null>;

const APPROVAL_REFRESH_REQUEST = { approvalCheck: true } as const;

/**
 * Auth.js only treats useSession().update as an update when data is supplied.
 * Calling update() without an argument falls back to a GET and leaves the JWT's
 * cached accountStatus unchanged until its normal staleness window expires.
 */
export function refreshApprovalSession<Session>(update: SessionUpdater<Session>) {
  return update(APPROVAL_REFRESH_REQUEST);
}
