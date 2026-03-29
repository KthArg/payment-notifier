export interface SinpeNameMapping {
  id: string;
  senderName: string;         // normalized (lowercase, trimmed)
  senderNameDisplay: string;  // original as it appeared in the email
  memberId: string | null;    // null if unlinked or ambiguous
  isAmbiguous: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Joined with member info for API responses */
export interface SinpeNameMappingWithMember extends SinpeNameMapping {
  memberName?: string;
}

/** Pending: no member linked yet and not ambiguous — needs admin action */
export type MappingStatus = 'pending' | 'linked' | 'ambiguous';

export function getMappingStatus(m: SinpeNameMapping): MappingStatus {
  if (m.isAmbiguous) return 'ambiguous';
  if (m.memberId) return 'linked';
  return 'pending';
}
