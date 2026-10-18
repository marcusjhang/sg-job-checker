import { createHash, randomUUID } from "node:crypto";
import type { Kysely, Selectable } from "kysely";
import type { Database, ReportRow, RuleVersionsTable } from "@job-checker/db";
import { enqueueJob, sql } from "@job-checker/db";
import type { Actor } from "@job-checker/identity";
import {
  AppError,
  ConfirmedEmploymentFactsV1Schema,
  conflict,
  formatCents,
  hashFacts,
  notFound,
  unavailable,
  validationFailed,
  type ConfirmedEmploymentFactsV1,
  type Evidence,
  type ReportRenderModel,
  type SourceReference
} from "@job-checker/contracts";
import {
  assessEmploymentActCoverage,
  assessKet,
  assessLeave,
  assessOvertime,
  calculateCompensation,
  calculateCpf,
  calculateHourlyDailyRates,
  cpfInputFromFacts,
  type CpfResult,
  type CpfRuleFixture,
  type EaCoverageResult,
  type EaRateResult
} from "@job-checker/rules";
import type { WageLookup } from "@job-checker/benchmarks";
import { recordAudit } from "@job-checker/audit";
import { env } from "@job-checker/observability/env";
import { buildRenderModel, type EvidenceRowLike } from "./render-model";

export type GenerateReportCommand = {
  operationKey: string;
  confirmedRevisionId: string;
  requestedPeriod?: string;
};

export type GenerateReportResult = {
  reportId: string;
  reportVersion: number;
  renderModel: ReportRenderModel;
  reused: boolean;
};

type RuleResolution = { rule?: Selectable<RuleVersionsTable>; sourceVersionIds: string[] };

async function resolveRule(
  trx: Kysely<Database>,
  key: string,
  asOf: string
): Promise<RuleResolution> {
  const rule = await trx
    .selectFrom("rule_versions")
    .selectAll()
    .where("rule_key", "=", key)
    .where("review_state", "=", "APPROVED")
    .where("effective_from", "<=", asOf)
    .where((eb) => eb.or([eb("effective_to", "is", null), eb("effective_to", ">=", asOf)]))
    .orderBy("effective_from", "desc")
    .limit(1)
    .executeTakeFirst();
  if (!rule) return { sourceVersionIds: [] };
  const deps = await trx
    .selectFrom("rule_source_dependencies")
    .select("source_version_id")
    .where("rule_version_id", "=", rule.id)
    .execute();
  return { rule, sourceVersionIds: deps.map((dep) => dep.source_version_id) };
}

async function loadSources(
  trx: Kysely<Database>,
  sourceVersionIds: string[],
  ruleLabels: Map<string, string>
): Promise<SourceReference[]> {
  if (sourceVersionIds.length === 0) return [];
  const rows = await sql<{
    id: string;
    content_sha256: string;
    effective_from: string | null;
    checked_at: Date;
    canonical_url: string;
    purpose: string;
    owner: string;
  }>`
    select sv.id, sv.content_sha256, sv.effective_from, sv.checked_at,
           s.canonical_url, s.purpose, s.owner
    from source_versions sv
    join sources s on s.id = sv.source_id
    where sv.id = any(${sourceVersionIds})
    order by s.owner, s.canonical_url
  `.execute(trx);
  return rows.rows.map((row) => {
    const reference: SourceReference = {
      label: `${row.owner}: ${row.purpose}`,
      url: row.canonical_url,
      effectiveDate: row.effective_from ?? row.checked_at.toISOString().slice(0, 10),
      snapshotChecksum: row.content_sha256
    };
    const ruleVersion = ruleLabels.get(row.id);
    if (ruleVersion) reference.ruleVersion = ruleVersion;
    return reference;
  });
}

function ruleMeta(resolution: RuleResolution, asOf: string) {
  return {
    ruleVersionId: resolution.rule?.id ?? "",
    sourceVersionIds: resolution.sourceVersionIds,
    effectiveDate: resolution.rule?.effective_from ?? asOf
  };
}

async function evidenceForBenchmark(
  trx: Kysely<Database>,
  confirmedRevisionId: string,
  asOf: string
): Promise<Evidence<WageLookup | null>> {
  const match = await trx
    .selectFrom("occupation_matches")
    .selectAll()
    .where("confirmed_revision_id", "=", confirmedRevisionId)
    .orderBy("created_at", "desc")
    .limit(1)
    .executeTakeFirst();
  if (!match || !match.selected_code) {
    return unavailable(
      "benchmark.occupation",
      "BENCHMARK",
      "Official wage context",
      "Select an occupation before generating a benchmark comparison.",
      { selectedCode: null }
    ) as unknown as Evidence<WageLookup | null>;
  }
  const snapshot = await trx
    .selectFrom("benchmark_snapshots")
    .selectAll()
    .where("effective_date", "<=", asOf)
    .where("review_state", "in", ["APPROVED", "DEMO"])
    .orderBy("effective_date", "desc")
    .limit(1)
    .executeTakeFirst();
  if (!snapshot) {
    return unavailable(
      "benchmark.occupation",
      "BENCHMARK",
      "Official wage context",
      "No approved benchmark snapshot is available for this date.",
      { selectedCode: match.selected_code }
    ) as unknown as Evidence<WageLookup | null>;
  }
  const occupation = await trx
    .selectFrom("occupations")
    .selectAll()
    .where("snapshot_id", "=", snapshot.id)
    .where("occupation_code", "=", match.selected_code)
    .orderBy("industry_code")
    .limit(1)
    .executeTakeFirst();
  if (!occupation) {
    return unavailable(
      "benchmark.occupation",
      "BENCHMARK",
      "Official wage context",
      "The selected occupation is not present in the approved snapshot.",
      { selectedCode: match.selected_code }
    ) as unknown as Evidence<WageLookup | null>;
  }
  const output: WageLookup = {
    available: true,
    title: occupation.title,
    datasetKey: snapshot.dataset_key,
    version: snapshot.version,
    effectiveDate: snapshot.effective_date,
    wageBasis: occupation.wage_basis,
    p25Cents: occupation.p25_cents === null ? null : Number(occupation.p25_cents),
    medianCents: occupation.median_cents === null ? null : Number(occupation.median_cents),
    p75Cents: occupation.p75_cents === null ? null : Number(occupation.p75_cents),
    coverage: occupation.coverage,
    limitations: snapshot.limitations,
    demo: snapshot.review_state === "DEMO" || snapshot.dataset_key === "DEMO_FIXTURE"
  };
  return {
    key: "benchmark.occupation",
    category: "BENCHMARK",
    title: "Official wage context",
    inputs: { occupationCode: match.selected_code, snapshotId: snapshot.id },
    output,
    steps: [
      {
        label: "Snapshot and wage basis",
        result: `${snapshot.dataset_key} ${snapshot.version}; ${occupation.wage_basis}; effective ${snapshot.effective_date}`
      },
      {
        label: "Percentiles",
        result: `P25 ${output.p25Cents === null ? "n/a" : formatCents(output.p25Cents)}; median ${
          output.medianCents === null ? "n/a" : formatCents(output.medianCents)
        }; P75 ${output.p75Cents === null ? "n/a" : formatCents(output.p75Cents)}`
      }
    ],
    benchmarkSnapshotId: snapshot.id,
    sourceVersionIds: [snapshot.source_version_id],
    effectiveDate: snapshot.effective_date,
    applicability: { status: "APPLIES", reasons: [] },
    warnings: [snapshot.limitations]
  };
}

function inputsHash(factsHash: string, period: string, occupationCode: string | null): string {
  return createHash("sha256")
    .update(JSON.stringify({ factsHash, period, occupationCode }))
    .digest("hex");
}

export async function generateReport(
  db: Kysely<Database>,
  actor: Actor,
  documentId: string,
  command: GenerateReportCommand
): Promise<GenerateReportResult> {
  return db.transaction().execute(async (trx) => {
    const document = await trx
      .selectFrom("documents")
      .selectAll()
      .where("id", "=", documentId)
      .where("user_id", "=", actor.userId)
      .forUpdate()
      .executeTakeFirst();
    if (!document) throw notFound();

    const confirmed = await trx
      .selectFrom("confirmed_revisions")
      .selectAll()
      .where("id", "=", command.confirmedRevisionId)
      .where("user_id", "=", actor.userId)
      .where("document_id", "=", documentId)
      .executeTakeFirst();
    if (!confirmed) throw notFound();
    const latest = await trx
      .selectFrom("confirmed_revisions")
      .select("id")
      .where("document_id", "=", documentId)
      .orderBy("revision", "desc")
      .limit(1)
      .executeTakeFirst();
    if (latest?.id !== confirmed.id) {
      throw conflict(
        "These facts were superseded. Review and confirm the latest revision.",
        "DOMAIN_STATE_CONFLICT"
      );
    }

    const factsParse = ConfirmedEmploymentFactsV1Schema.safeParse(confirmed.facts);
    if (!factsParse.success) {
      throw validationFailed([{ field: "facts", message: "Confirmed facts are invalid." }]);
    }
    const facts = factsParse.data as ConfirmedEmploymentFactsV1;
    const period = command.requestedPeriod ?? facts.compensationPeriod;
    if (!/^\d{4}-\d{2}$/.test(period)) {
      throw validationFailed([{ field: "requestedPeriod", message: "Use YYYY-MM." }]);
    }
    const periodDate = `${period}-01`;
    const startMonth = `${facts.startDate.slice(0, 7)}-01`;
    if (periodDate < startMonth) {
      throw validationFailed([
        {
          field: "requestedPeriod",
          message: "The report period cannot precede the employment start date."
        }
      ]);
    }
    const maxPeriod = new Date(`${startMonth}T00:00:00Z`);
    maxPeriod.setUTCMonth(maxPeriod.getUTCMonth() + 24);
    if (periodDate > maxPeriod.toISOString().slice(0, 10)) {
      throw validationFailed([
        {
          field: "requestedPeriod",
          message: "The report period is more than 24 months after the start date."
        }
      ]);
    }

    const selectedMatch = await trx
      .selectFrom("occupation_matches")
      .select("selected_code")
      .where("confirmed_revision_id", "=", confirmed.id)
      .orderBy("created_at", "desc")
      .limit(1)
      .executeTakeFirst();
    const selectedCode = selectedMatch?.selected_code ?? null;
    const hash = inputsHash(confirmed.facts_sha256, periodDate, selectedCode);

    const insertedRequest = await sql<{ id: string }>`
      insert into generation_requests (
        user_id, document_id, operation_key, confirmed_revision_id, requested_period,
        inputs_sha256, state
      ) values (
        ${actor.userId}, ${documentId}, ${command.operationKey}, ${confirmed.id}, ${periodDate},
        ${hash}, 'PENDING'
      )
      on conflict (user_id, operation_key) do nothing
      returning id
    `.execute(trx);

    const requestId = insertedRequest.rows[0]?.id;
    if (!requestId) {
      const existing = await trx
        .selectFrom("generation_requests")
        .selectAll()
        .where("user_id", "=", actor.userId)
        .where("operation_key", "=", command.operationKey)
        .forUpdate()
        .executeTakeFirst();
      if (!existing)
        throw new AppError("INTERNAL", 500, "Could not create the generation request.");
      if (existing.inputs_sha256 !== hash) {
        throw conflict(
          "This operation key was already used with different inputs.",
          "IDEMPOTENCY_CONFLICT"
        );
      }
      if (existing.state === "COMPLETED" && existing.report_id) {
        const report = await trx
          .selectFrom("reports")
          .selectAll()
          .where("id", "=", existing.report_id)
          .where("user_id", "=", actor.userId)
          .executeTakeFirst();
        if (!report) throw new AppError("INTERNAL", 500, "The completed report is missing.");
        return {
          reportId: report.id,
          reportVersion: report.version,
          renderModel: report.rendered_json as ReportRenderModel,
          reused: true
        };
      }
      throw conflict(
        "Report generation is already in progress for this request.",
        "DOMAIN_STATE_CONFLICT"
      );
    }

    if (document.state !== "READY") {
      throw conflict(
        "Confirm every critical fact before generating a report.",
        "DOMAIN_STATE_CONFLICT"
      );
    }

    const cpfResolution = await resolveRule(trx, "cpf.contribution", periodDate);
    const compensationResolution = await resolveRule(trx, "compensation.guaranteed", periodDate);
    const ketResolution = await resolveRule(trx, "ket.completeness", periodDate);
    const coverageResolution = await resolveRule(trx, "employment-act.coverage", periodDate);
    const rateResolution = await resolveRule(trx, "employment-act.rate-of-pay", periodDate);
    const overtimeResolution = await resolveRule(trx, "employment-act.overtime", periodDate);
    const leaveResolution = await resolveRule(trx, "employment-act.leave", periodDate);

    const evidence: Array<Evidence<unknown>> = [];

    let cpfEvidence: Evidence<CpfResult> | Evidence<null>;
    if (cpfResolution.rule) {
      const fixture = cpfResolution.rule.fixture as CpfRuleFixture;
      cpfEvidence = calculateCpf(cpfInputFromFacts(facts), fixture, {
        ruleVersionId: cpfResolution.rule.id,
        sourceVersionIds: cpfResolution.sourceVersionIds,
        effectiveFrom: cpfResolution.rule.effective_from
      });
    } else {
      cpfEvidence = unavailable(
        "cpf.contribution",
        "CPF",
        "CPF contribution",
        "No approved CPF rule is effective for this period.",
        { period: periodDate }
      ) as Evidence<null>;
    }
    evidence.push(cpfEvidence as Evidence<unknown>);

    if (compensationResolution.rule) {
      const compensation = calculateCompensation(
        facts,
        cpfEvidence,
        ruleMeta(compensationResolution, periodDate)
      );
      evidence.push(compensation as Evidence<unknown>);
    } else {
      evidence.push(
        unavailable(
          "compensation.guaranteed",
          "COMPENSATION",
          "Guaranteed compensation",
          "No approved compensation rule is effective for this period."
        ) as Evidence<unknown>
      );
    }

    if (ketResolution.rule) {
      const checks = assessKet(facts, {
        ...ruleMeta(ketResolution, periodDate),
        sourceUrl:
          "https://www.mom.gov.sg/employment-practices/contract-of-service/key-employment-terms"
      });
      evidence.push(...(checks as Evidence<unknown>[]));
    } else {
      evidence.push(
        unavailable(
          "ket.completeness",
          "KET",
          "Key Employment Terms",
          "No approved KET rule is effective for this period."
        ) as Evidence<unknown>
      );
    }

    if (
      coverageResolution.rule &&
      rateResolution.rule &&
      overtimeResolution.rule &&
      leaveResolution.rule
    ) {
      const coverage = assessEmploymentActCoverage(facts, ruleMeta(coverageResolution, periodDate));
      const rate = calculateHourlyDailyRates(facts, ruleMeta(rateResolution, periodDate));
      const overtime = assessOvertime(
        facts,
        coverage as Evidence<EaCoverageResult>,
        rate as Evidence<EaRateResult>,
        ruleMeta(overtimeResolution, periodDate),
        null
      );
      const leave = assessLeave(facts, ruleMeta(leaveResolution, periodDate));
      evidence.push(
        coverage as Evidence<unknown>,
        rate as Evidence<unknown>,
        overtime as Evidence<unknown>,
        leave as Evidence<unknown>
      );
    } else {
      for (const key of [
        "employment-act.coverage",
        "employment-act.rate-of-pay",
        "employment-act.overtime",
        "employment-act.leave"
      ]) {
        evidence.push(
          unavailable(
            key,
            "EMPLOYMENT_ACT",
            "Employment Act context",
            "No approved Employment Act rule is effective for this period."
          ) as Evidence<unknown>
        );
      }
    }

    const benchmarkEvidence = await evidenceForBenchmark(trx, confirmed.id, periodDate);
    evidence.push(benchmarkEvidence as Evidence<unknown>);

    const rows: EvidenceRowLike[] = evidence.map((item) => {
      const withMeta = item as Evidence<unknown> & { ruleVersionId?: string };
      return {
        key: item.key,
        category: item.category,
        output: item.output,
        steps: item.steps,
        applicability: item.applicability,
        warnings: item.warnings,
        effectiveDate: item.effectiveDate,
        ruleVersionId: withMeta.ruleVersionId ?? null
      };
    });

    const partialCoverage = evidence.some(
      (item) =>
        item.applicability.status === "UNAVAILABLE" || item.applicability.status === "INDETERMINATE"
    );

    const allSourceVersionIds = [
      ...new Set(evidence.flatMap((item) => item.sourceVersionIds.map((id) => id as string)))
    ];

    const ruleLabels = new Map<string, string>();
    for (const resolution of [
      cpfResolution,
      compensationResolution,
      ketResolution,
      coverageResolution,
      rateResolution,
      overtimeResolution,
      leaveResolution
    ]) {
      if (resolution.rule) {
        for (const sourceId of resolution.sourceVersionIds) {
          ruleLabels.set(
            sourceId,
            `${resolution.rule.rule_key}@${resolution.rule.semantic_version}`
          );
        }
      }
    }
    const sources = await loadSources(trx, allSourceVersionIds, ruleLabels);

    const latestReport = await trx
      .selectFrom("reports")
      .select(["lineage_id", "version"])
      .where("document_id", "=", documentId)
      .orderBy("version", "desc")
      .limit(1)
      .executeTakeFirst();
    const reportId = randomUUID();
    const lineageId = latestReport?.lineage_id ?? randomUUID();
    const reportVersion = (latestReport?.version ?? 0) + 1;
    const generatedAt = new Date().toISOString();
    const benchmarkOutput = benchmarkEvidence.output as WageLookup | null;
    const benchmarkDemo =
      benchmarkOutput !== null && benchmarkOutput.available === true && benchmarkOutput.demo;

    const renderModel = buildRenderModel({
      reportId,
      reportVersion,
      generatedAt,
      facts,
      evidence: rows,
      sources,
      partialCoverage,
      staleDependencies: [],
      benchmarkDemo
    });

    const manifest = {
      factsSha256: hashFacts(facts),
      confirmedRevisionId: confirmed.id,
      buildId: env().BUILD_ID,
      schemaVersions: { facts: "employment-v1", report: 1 },
      ruleVersions: [
        cpfResolution.rule,
        compensationResolution.rule,
        ketResolution.rule,
        coverageResolution.rule,
        rateResolution.rule,
        overtimeResolution.rule,
        leaveResolution.rule
      ]
        .filter((rule): rule is Selectable<RuleVersionsTable> => Boolean(rule))
        .map((rule) => ({ key: rule.rule_key, version: rule.semantic_version, id: rule.id })),
      sourceVersionIds: allSourceVersionIds,
      benchmarkSnapshotId: benchmarkEvidence.benchmarkSnapshotId ?? null,
      evidenceKeys: evidence.map((item) => item.key),
      generatedAt,
      partialCoverage
    };

    await trx
      .insertInto("reports")
      .values({
        id: reportId,
        user_id: actor.userId,
        document_id: documentId,
        lineage_id: lineageId,
        version: reportVersion,
        confirmed_revision_id: confirmed.id,
        status: "GENERATED",
        rendered_json: JSON.stringify(renderModel),
        manifest: JSON.stringify(manifest),
        partial_coverage: partialCoverage
      })
      .execute();

    for (const item of evidence) {
      await trx
        .insertInto("evidence")
        .values({
          user_id: actor.userId,
          report_id: reportId,
          category: item.category,
          key: item.key,
          inputs: JSON.stringify(item.inputs),
          output: JSON.stringify(item.output),
          steps: JSON.stringify(item.steps),
          rule_version_id: (item as { ruleVersionId?: string }).ruleVersionId ?? null,
          benchmark_snapshot_id:
            (item as { benchmarkSnapshotId?: string }).benchmarkSnapshotId ?? null,
          source_version_ids: item.sourceVersionIds,
          effective_date: item.effectiveDate,
          applicability: JSON.stringify(item.applicability),
          warnings: JSON.stringify(item.warnings)
        })
        .execute();
      if (item.ruleVersionId) {
        await trx
          .insertInto("report_dependencies")
          .values({
            report_id: reportId,
            dependency_type: "RULE",
            dependency_id: item.ruleVersionId
          })
          .onConflict((oc) =>
            oc.columns(["report_id", "dependency_type", "dependency_id"]).doNothing()
          )
          .execute();
      }
      if (item.benchmarkSnapshotId) {
        await trx
          .insertInto("report_dependencies")
          .values({
            report_id: reportId,
            dependency_type: "BENCHMARK",
            dependency_id: item.benchmarkSnapshotId
          })
          .onConflict((oc) =>
            oc.columns(["report_id", "dependency_type", "dependency_id"]).doNothing()
          )
          .execute();
      }
      for (const sourceId of item.sourceVersionIds) {
        await trx
          .insertInto("report_dependencies")
          .values({ report_id: reportId, dependency_type: "SOURCE", dependency_id: sourceId })
          .onConflict((oc) =>
            oc.columns(["report_id", "dependency_type", "dependency_id"]).doNothing()
          )
          .execute();
      }
    }
    await trx
      .insertInto("report_dependencies")
      .values({
        report_id: reportId,
        dependency_type: "CONFIRMED_REVISION",
        dependency_id: confirmed.id
      })
      .onConflict((oc) => oc.columns(["report_id", "dependency_type", "dependency_id"]).doNothing())
      .execute();

    await trx
      .updateTable("generation_requests")
      .set({ state: "COMPLETED", report_id: reportId, completed_at: new Date() })
      .where("id", "=", requestId)
      .execute();

    await trx
      .updateTable("documents")
      .set({
        state: "GENERATED",
        updated_at: new Date(),
        retention_expires_at: new Date(Date.now() + env().REPORT_RETENTION_DAYS * 86_400_000)
      })
      .where("id", "=", documentId)
      .where("version", "=", document.version)
      .execute();

    await enqueueJob(trx, {
      userId: actor.userId,
      kind: "EXPIRE_RETENTION",
      subjectId: documentId,
      subjectVersion: document.version,
      occurrenceKey: randomUUID(),
      payload: { phase: "raw", documentVersion: document.version },
      availableAt: new Date(Date.now() + env().RAW_RETENTION_HOURS * 3_600_000)
    });

    await recordAudit(trx, {
      userId: actor.userId,
      actorType: "USER",
      actorId: actor.userId,
      action: "report.generate",
      subjectType: "report",
      subjectId: reportId,
      result: "SUCCESS",
      metadata: {
        reportVersion,
        partialCoverage,
        ruleCount: manifest.ruleVersions.length
      }
    });

    return { reportId, reportVersion, renderModel, reused: false };
  });
}

export async function getReportForActor(
  db: Kysely<Database>,
  actor: Actor,
  reportId: string
): Promise<ReportRow> {
  const report = await db
    .selectFrom("reports")
    .selectAll()
    .where("id", "=", reportId)
    .where("user_id", "=", actor.userId)
    .executeTakeFirst();
  if (!report) throw notFound();
  return report;
}
