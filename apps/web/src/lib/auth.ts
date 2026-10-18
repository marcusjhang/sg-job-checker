import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@job-checker/db";
import { SESSION_COOKIE, actorFromToken, type Actor } from "@job-checker/identity";
import { staffEmails } from "@job-checker/observability/env";

export async function currentActor(): Promise<Actor | null> {
  const store = await cookies();
  return actorFromToken(getDb(), store.get(SESSION_COOKIE)?.value, staffEmails());
}

export async function requirePageActor(nextPath = "/"): Promise<Actor> {
  const actor = await currentActor();
  if (!actor) redirect(`/signin?next=${encodeURIComponent(nextPath)}`);
  return actor;
}

export async function requireStaffPage(): Promise<Actor> {
  const actor = await requirePageActor("/operations");
  if (!actor.isStaff) redirect("/");
  return actor;
}
