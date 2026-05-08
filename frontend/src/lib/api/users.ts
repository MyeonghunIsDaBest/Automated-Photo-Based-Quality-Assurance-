// Wraps `listProfiles` and converts the org-wide profile directory into the
// legacy `User[]` shape that pre-Phase-A surfaces (Dashboard "Team" panel,
// task assignee dropdowns) read from `useAppStore.users`. Phase E intends
// to remove the legacy User type entirely; this file is the seam.

import { listProfiles } from './profiles';
import { profileToUser } from '../../types';
import type { User } from '../../types';

export async function listUsers(): Promise<User[]> {
  const profiles = await listProfiles();
  return profiles
    .filter((p) => p.isActive)
    .map((p) => profileToUser(p));
}
