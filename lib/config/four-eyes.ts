/**
 * Four-eyes approval (docs/06 §2, docs/10 §5): the administrator who submits a
 * configuration version for review cannot approve and publish it. Shared by
 * workflow and policy versioning.
 */

export interface Actor {
  id: string;
  name: string;
}

interface Submitted {
  submittedById?: string;
  submittedBy?: string;
}

/** Reason the actor may not approve, or undefined when a second person is approving. */
export function fourEyesViolation(item: Submitted, actor: Actor): string | undefined {
  // Seeded versions may predate submitter ids; fall back to the recorded name.
  const same = item.submittedById ? item.submittedById === actor.id : item.submittedBy !== undefined && item.submittedBy === actor.name;
  return same ? `Four-eyes rule: ${actor.name} submitted this version, so a different administrator must approve and publish it` : undefined;
}
