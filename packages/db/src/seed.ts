import { sql, type Kysely } from "kysely";
import type { Database } from "./schema";
import {
  PRIVACY_NOTICE_MARKDOWN,
  PRIVACY_NOTICE_VERSION,
  PRIVACY_POLICY_KEY,
  PRIVACY_NOTICE_EFFECTIVE_FROM
} from "@job-checker/contracts";
import {
  SEED_BENCHMARK,
  SEED_RULES,
  SEED_SOURCES,
  checksum,
  hashImplementation
} from "@job-checker/rules";

export async function seedDatabase(db: Kysely<Database>): Promise<void> {
  const policyHash = checksum(PRIVACY_NOTICE_MARKDOWN);
  await sql`
    insert into policy_versions (policy_key, version, content_sha256, body_markdown, effective_from)
    values (${PRIVACY_POLICY_KEY}, ${PRIVACY_NOTICE_VERSION}, ${policyHash},
      ${PRIVACY_NOTICE_MARKDOWN}, ${PRIVACY_NOTICE_EFFECTIVE_FROM})
    on conflict (policy_key, version) do nothing
  `.execute(db);

  const sourceIds = new Map<string, string>();
  const sourceVersionIds = new Map<string, string>();

  for (const source of SEED_SOURCES) {
    await sql`
      insert into sources (owner, canonical_url, purpose, refresh_policy, max_stale_days)
      values (${source.owner}, ${source.url}, ${source.purpose}, ${source.refreshPolicy}, ${source.maxStaleDays})
      on conflict (canonical_url) do nothing
    `.execute(db);
    const found = await sql<{ id: string }>`
      select id from sources where canonical_url = ${source.url}
    `.execute(db);
    const sourceId = found.rows[0]?.id;
    if (!sourceId) throw new Error(`Failed to seed source ${source.key}`);
    sourceIds.set(source.key, sourceId);

    const snapshot = {
      key: source.key,
      url: source.url,
      purpose: source.purpose,
      capturedBy: "seed-registry",
      capturedAt: "2026-10-18",
      note: "Registry seed. A production deployment must replace this with a captured official artefact and second-person approval."
    };
    const contentHash = checksum(snapshot);
    await sql`
      insert into source_versions (
        source_id, content_sha256, snapshot_object_key, effective_from, checked_at,
        review_state, approved_by, approved_at, extracted
      ) values (
        ${sourceId}, ${contentHash}, ${`registry://${source.key}/2026-10-18`},
        ${source.effectiveFrom}, ${"2026-10-18T00:00:00.000Z"}, 'APPROVED',
        'seed-source-reviewer (engineering fixture; production requires independent approval)',
        ${"2026-10-18T00:00:00.000Z"}, ${JSON.stringify(snapshot)}::jsonb
      )
      on conflict (source_id, content_sha256) do nothing
    `.execute(db);
    const version = await sql<{ id: string }>`
      select id from source_versions
      where source_id = ${sourceId} and content_sha256 = ${contentHash}
    `.execute(db);
    const versionId = version.rows[0]?.id;
    if (!versionId) throw new Error(`Failed to seed source version ${source.key}`);
    sourceVersionIds.set(source.key, versionId);
  }

  for (const rule of SEED_RULES) {
    const implementation = hashImplementation(rule.fixture);
    await sql`
      insert into rule_versions (
        rule_key, semantic_version, effective_from, effective_to, implementation_sha256,
        review_state, approved_by, approved_at, fixture
      ) values (
        ${rule.key}, ${rule.semanticVersion}, ${rule.effectiveFrom}, ${rule.effectiveTo},
        ${implementation}, 'APPROVED', ${rule.approvedBy},
        ${"2026-10-18T00:00:00.000Z"}, ${JSON.stringify(rule.fixture)}::jsonb
      )
      on conflict (rule_key, semantic_version) do nothing
    `.execute(db);
    const found = await sql<{ id: string }>`
      select id from rule_versions where rule_key = ${rule.key} and semantic_version = ${rule.semanticVersion}
    `.execute(db);
    const ruleId = found.rows[0]?.id;
    if (!ruleId) throw new Error(`Failed to seed rule ${rule.key}@${rule.semanticVersion}`);
    for (const sourceKey of rule.sourceKeys) {
      const sourceVersionId = sourceVersionIds.get(sourceKey);
      if (!sourceVersionId) throw new Error(`Missing source ${sourceKey} for rule ${rule.key}`);
      await sql`
        insert into rule_source_dependencies (rule_version_id, source_version_id)
        values (${ruleId}, ${sourceVersionId})
        on conflict do nothing
      `.execute(db);
    }
  }

  const benchmarkSourceId = sourceVersionIds.get("mom-occupational-wages");
  if (!benchmarkSourceId) throw new Error("Missing benchmark source version");
  await sql`
    insert into benchmark_snapshots (
      dataset_key, version, source_version_id, effective_date, review_state,
      wage_basis, coverage, limitations
    ) values (
      ${SEED_BENCHMARK.datasetKey}, ${SEED_BENCHMARK.version}, ${benchmarkSourceId},
      ${SEED_BENCHMARK.effectiveDate}, 'DEMO', ${SEED_BENCHMARK.wageBasis},
      ${JSON.stringify(SEED_BENCHMARK.coverage)}::jsonb, ${SEED_BENCHMARK.limitations}
    )
    on conflict (dataset_key, version) do nothing
  `.execute(db);
  const snapshot = await sql<{ id: string }>`
    select id from benchmark_snapshots
    where dataset_key = ${SEED_BENCHMARK.datasetKey} and version = ${SEED_BENCHMARK.version}
  `.execute(db);
  const snapshotId = snapshot.rows[0]?.id;
  if (!snapshotId) throw new Error("Failed to seed benchmark snapshot");

  for (const occupation of SEED_BENCHMARK.occupations) {
    await sql`
      insert into occupations (
        snapshot_id, occupation_code, title, industry_code, p25_cents, median_cents,
        p75_cents, wage_basis, coverage
      ) values (
        ${snapshotId}, ${occupation.code}, ${occupation.title}, ${occupation.industry},
        ${occupation.p25}, ${occupation.median}, ${occupation.p75},
        ${SEED_BENCHMARK.wageBasis}, ${JSON.stringify({ demo: true })}::jsonb
      )
      on conflict do nothing
    `.execute(db);
  }
}
