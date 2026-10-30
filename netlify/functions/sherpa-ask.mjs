// Ask the Scent Sherpa (/.netlify/functions/sherpa-ask): POST { q, history?: [{role, content}] } → { mode, tier, understood, headline, picks[], questions[], memory }
// Powered by the Claude API (ANTHROPIC_API_KEY in Netlify). Model: ANTHROPIC_MODEL, default claude-sonnet-5-5; falls back to
// Haiku if that model is busy. Picks can only be scents on the shelf (enforced by the answer schema and checked again here).
// Limits: 500 characters per question, 25 questions per connection per hour, SHERPA_DAILY_CAP (default 800) per day overall.
// Every question and answer is logged to the "vv-sherpa-log" blob store (Netlify → Blobs) so you can see what people ask.
import { getStore } from "@netlify/blobs";
import { allowed, clip } from "../lib/store.mjs";
import { systemBlocks, answerSchema, buildMessages, shapeAnswer, memoryLine } from "../lib/sherpa-ai.mjs";

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
const BACKUP = "claude-haiku-5-5";

async function callClaude(model, body, key, ms) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", signal: ctl.signal,
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ ...body, model }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(data?.error?.message || `HTTP ${r.status}`); e.status = r.status; throw e; }
    return data;
  } finally { clearTimeout(t); }
}

async function dailyOk() {
  const cap = +process.env.SHERPA_DAILY_CAP || 800;
  try {
    const s = getStore("vv-meta"), key = "sherpa-day-" + new Date().toISOString().slice(0, 10);
    const n = (await s.get(key, { type: "json" })) || 0;
    if (n >= cap) return false;
    await s.setJSON(key, n + 1);
  } catch (e) { console.error("sherpa day counter", e); }
  return true;
}

export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return json(503, { error: "The Scent Sherpa is getting ready. Try the quiz for now." });
  let input; try { input = await req.json(); } catch { return json(400, { error: "Bad request" }); }
  const q = clip(input.q, 500);
  if (!q) return json(400, { error: "Tell me what you're looking for." });
  const history = (Array.isArray(input.history) ? input.history : []).slice(-6).map((h) => ({ role: h.role === "assistant" ? "assistant" : "user", content: clip(h.content, 900) }));
  if (!(await allowed(req, "sherpa-ask", 25))) return json(429, { error: "You've asked a lot this hour. Give me a little break and try again soon." });
  if (!(await dailyOk())) return json(429, { error: "The Sherpa has been busy today. Try the quiz, or come back tomorrow." });

  const { messages, hits } = buildMessages(q, history);
  const body = { max_tokens: 1400, temperature: 0.4, system: systemBlocks(), messages, output_config: { format: { type: "json_schema", schema: answerSchema() } } };
  const t0 = Date.now();
  let data, used = MODEL;
  try { data = await callClaude(MODEL, body, key, 22000); }
  catch (e) {
    console.error("sherpa primary", e.status, e.message);
    if (e.status === 400 || e.status === 401) return json(502, { error: "The Sherpa hit a snag. Try again in a moment." });
    try { used = BACKUP; data = await callClaude(BACKUP, body, key, 15000); }
    catch (e2) { console.error("sherpa backup", e2.status, e2.message); return json(502, { error: "The Sherpa is swamped right now. Try again in a moment, or take the quiz." }); }
  }
  let raw;
  try { raw = JSON.parse((data.content || []).find((b) => b.type === "text")?.text || "{}"); }
  catch { return json(502, { error: "The Sherpa lost its train of thought. Please ask again." }); }
  const ans = shapeAnswer(raw);
  ans.memory = memoryLine(ans);

  try {
    const id = new Date().toISOString().replace(/[:.]/g, "-") + "-" + Math.random().toString(36).slice(2, 7);
    await getStore("vv-sherpa-log").setJSON(id, { q, turns: history.length, refs: hits.map((h) => `${h.b} ${h.n}`), mode: ans.mode, tier: ans.tier, understood: ans.understood, picks: ans.picks.map((p) => `${p.id} ${p.score}`), considered: raw.considered || "", model: used, ms: Date.now() - t0, usage: data.usage || null });
  } catch (e) { console.error("sherpa log", e); }
  return json(200, ans);
};

