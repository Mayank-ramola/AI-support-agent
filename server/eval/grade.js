// Decides whether one agent turn meets the expectations in questions.json.
//   expect.handoff  (default false): must the agent hand off to a human?
//   expect.anyText: reply must contain at least one of these (case-insensitive)
//   expect.noText:  reply must contain none of these
//   expect.tool:    this tool must have been called
export function gradeTurn(expect = {}, result) {
  const problems = [];
  const wantHandoff = expect.handoff === true;
  if (result.handoff !== wantHandoff) problems.push(wantHandoff ? "should have handed off" : `unexpected handoff (${result.handoffReason})`);

  const text = String(result.reply || result.draft || "").toLowerCase();
  if (!wantHandoff && expect.anyText?.length && !expect.anyText.some((t) => text.includes(t.toLowerCase()))) {
    problems.push(`missing any of: ${expect.anyText.join(" | ")}`);
  }
  for (const t of expect.noText || []) {
    if (text.includes(t.toLowerCase())) problems.push(`reply contains forbidden text: ${t}`);
  }
  if (expect.tool && !result.toolsUsed.includes(expect.tool)) problems.push(`tool ${expect.tool} was not called`);
  return { pass: problems.length === 0, problems };
}
