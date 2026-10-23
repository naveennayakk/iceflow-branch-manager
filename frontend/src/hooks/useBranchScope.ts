import { useCallback, useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

/** Active branch for sub-admin login OR main viewing a workspace / ?branchId= */
export function useBranchScope() {
  const user = useAuthStore((s) => s.user);
  const { branchId: routeBranchId } = useParams<{ branchId?: string }>();
  const [searchParams] = useSearchParams();
  const queryBranchId = searchParams.get('branchId');

  const branchId = useMemo(
    () =>
      user?.role === 'SUB_ADMIN'
        ? user.branchId
        : routeBranchId || queryBranchId || null,
    [user?.role, user?.branchId, routeBranchId, queryBranchId]
  );

  const isMainWorkspace = user?.role === 'MAIN_ADMIN' && !!routeBranchId;
  const isMainBranchView = user?.role === 'MAIN_ADMIN' && !!branchId;
  const basePath = isMainWorkspace
    ? `/main/workspace/${routeBranchId}`
    : user?.role === 'MAIN_ADMIN'
      ? '/main'
      : '/sub';

  const qs = useCallback(
    (extra?: Record<string, string | undefined>) => {
      const p = new URLSearchParams();
      if (user?.role === 'MAIN_ADMIN' && branchId) p.set('branchId', branchId);
      if (extra) {
        for (const [k, v] of Object.entries(extra)) {
          if (v != null && v !== '') p.set(k, v);
        }
      }
      const s = p.toString();
      return s ? `?${s}` : '';
    },
    [user?.role, branchId]
  );

  return { branchId, isMainWorkspace, isMainBranchView, basePath, qs, user };
}
