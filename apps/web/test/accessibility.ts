import axe, { type ElementContext, type Result } from "axe-core";

const wcagTags = [
  "wcag2a",
  "wcag2aa",
  "wcag21a",
  "wcag21aa",
  "wcag22aa",
  "best-practice",
] as const;

export async function expectNoAxeViolations(
  context: ElementContext,
): Promise<void> {
  const { violations } = await axe.run(context, {
    rules: {
      // JSDOM has no rendered CSS/canvas; contrast is checked in real-browser
      // and manual QA instead of emitting false confidence and canvas errors.
      "color-contrast": { enabled: false },
      // Component fragments do not own page landmarks; full-page landmark
      // structure is covered by shell semantic tests and the manual audit.
      region: { enabled: false },
    },
    runOnly: {
      type: "tag",
      values: [...wcagTags],
    },
  });

  if (violations.length > 0) {
    throw new Error(formatViolations(violations));
  }
}

function formatViolations(violations: Result[]): string {
  return violations
    .map((violation) => {
      const nodes = violation.nodes
        .map((node) => `  - ${node.target.join(" ")}: ${node.failureSummary ?? "failed"}`)
        .join("\n");

      return [
        `${violation.id} (${violation.impact ?? "unknown impact"}): ${violation.help}`,
        violation.helpUrl,
        nodes,
      ].join("\n");
    })
    .join("\n\n");
}
