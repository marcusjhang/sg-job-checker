import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";
import type { ReportRenderModel } from "@job-checker/contracts";
import { formatCents } from "@job-checker/contracts";

function ascii(value: string): string {
  return value
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u00a0/g, " ")
    .replace(/[^\x20-\x7E\n]/g, "");
}

export async function renderReportPdf(model: ReportRenderModel): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Job Checker report ${model.reportId} v${model.reportVersion}`);
  pdf.setAuthor("Singapore Job Checker");
  pdf.setSubject("Structured second opinion, not legal advice");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const width = 595.28;
  const height = 841.89;
  const margin = 48;
  let page = pdf.addPage([width, height]);
  let y = height - margin;

  const newPage = () => {
    page = pdf.addPage([width, height]);
    y = height - margin;
    page.drawText("Singapore Job Checker - structured second opinion, not legal advice", {
      x: margin,
      y: height - 26,
      size: 7,
      font: regular,
      color: rgb(0.45, 0.45, 0.45)
    });
  };

  const ensure = (needed: number) => {
    if (y - needed < margin + 20) newPage();
  };

  const wrap = (text: string, size: number, maxWidth: number, font = regular): string[] => {
    const words = ascii(text).split(/\s+/);
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
    return lines;
  };

  const drawParagraph = (
    text: string,
    size: number,
    color = rgb(0.1, 0.1, 0.1),
    font = regular
  ) => {
    for (const line of wrap(text, size, width - margin * 2, font)) {
      ensure(size + 6);
      page.drawText(line, { x: margin, y, size, font, color });
      y -= size + 4;
    }
  };

  page.drawText("Singapore job offer / contract report", {
    x: margin,
    y,
    size: 20,
    font: bold,
    color: rgb(0.12, 0.18, 0.16)
  });
  y -= 28;
  drawParagraph(
    `${model.factsSummary.employer} - ${model.factsSummary.jobTitle} - ${model.factsSummary.startDate}`,
    11,
    rgb(0.25, 0.25, 0.25)
  );
  drawParagraph(
    `Report ${model.reportId} version ${model.reportVersion}, generated ${model.generatedAt}${model.partialCoverage ? " (partial coverage)" : ""}`,
    9,
    rgb(0.35, 0.35, 0.35)
  );
  y -= 8;

  for (const disclaimer of model.disclaimers) {
    drawParagraph(disclaimer, 8.5, rgb(0.45, 0.25, 0.15));
  }
  y -= 6;

  for (const section of model.sections) {
    ensure(34);
    page.drawText(ascii(section.title), {
      x: margin,
      y,
      size: 13,
      font: bold,
      color: rgb(0.12, 0.18, 0.16)
    });
    y -= 16;
    drawParagraph(section.summary, 9, rgb(0.35, 0.35, 0.35));
    y -= 2;

    for (const item of section.values) {
      ensure(24);
      page.drawText(ascii(item.label), {
        x: margin,
        y,
        size: 9,
        font: bold,
        color: rgb(0.2, 0.2, 0.2)
      });
      y -= 11;
      drawParagraph(item.value, 10);
      if (item.formula) drawParagraph(item.formula, 7.5, rgb(0.45, 0.45, 0.45));
      if (item.warning) drawParagraph(item.warning, 7.5, rgb(0.55, 0.3, 0.15));
      y -= 3;
    }

    for (const item of section.items ?? []) {
      ensure(22);
      drawParagraph(`${item.label}: ${item.status}`, 9, rgb(0.2, 0.2, 0.2), bold);
      drawParagraph(item.detail, 8.5, rgb(0.35, 0.35, 0.35));
      if (item.action) drawParagraph(`Next action: ${item.action}`, 8, rgb(0.3, 0.35, 0.45));
      y -= 2;
    }

    for (const warning of section.warnings) {
      drawParagraph(warning, 8, rgb(0.55, 0.3, 0.15));
    }
    y -= 8;
  }

  if (model.questions.length > 0) {
    ensure(30);
    page.drawText("Questions for HR", { x: margin, y, size: 13, font: bold });
    y -= 16;
    for (const question of model.questions) {
      drawParagraph(`- ${question.text}`, 9.5);
      drawParagraph(question.reason, 8, rgb(0.45, 0.45, 0.45));
      y -= 2;
    }
    y -= 8;
  }

  ensure(30);
  page.drawText("Sources and versions", { x: margin, y, size: 13, font: bold });
  y -= 16;
  for (const source of model.sources) {
    drawParagraph(`${source.label}`, 9);
    drawParagraph(`${source.url} - effective ${source.effectiveDate}`, 8, rgb(0.35, 0.35, 0.35));
    drawParagraph(
      `Snapshot ${source.snapshotChecksum.slice(0, 16)}...`,
      7.5,
      rgb(0.45, 0.45, 0.45)
    );
    if (source.limitations) drawParagraph(source.limitations, 7.5, rgb(0.55, 0.3, 0.15));
    y -= 2;
  }

  const pages = pdf.getPages();
  pages.forEach((current, index) => {
    current.drawText(
      `Report ${model.reportId.slice(0, 8)} v${model.reportVersion} - page ${index + 1} of ${pages.length}`,
      { x: margin, y: 22, size: 7.5, font: regular, color: rgb(0.5, 0.5, 0.5) }
    );
    current.drawText("PROTOTYPE - NOT LEGAL ADVICE", {
      x: width / 2 - 80,
      y: height / 2,
      size: 34,
      font: bold,
      color: rgb(0.9, 0.9, 0.88),
      rotate: degrees(35)
    });
  });

  return pdf.save();
}

export function renderModelSalary(model: ReportRenderModel): string {
  return formatCents(model.factsSummary.basicMonthlySalary.cents);
}
