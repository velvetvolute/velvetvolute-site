// Daily check (10am Toronto): sends "Enjoy your order" to shipped orders 5 days after their
// "on its way" email. The queue is filled by square-webhook.mjs when a shipment is marked complete.
import { getStore } from "@netlify/blobs";
import { sendEnjoy } from "../lib/enjoy.mjs";

export default async () => {
  const token = process.env.SQUARE_ACCESS_TOKEN;
  if (!token) return new Response("not configured", { status: 500 });
  const store = getStore("vv-enjoy-queue");
  const { blobs } = await store.list();
  let sent = 0;
  for (const { key } of blobs) {
    const job = await store.get(key, { type: "json" }).catch(() => null);
    if (!job || Date.now() < Number(job.due || 0)) continue;
    try {
      await sendEnjoy(key, token, { delivered: true });
      await store.delete(key);
      sent++;
    } catch (e) { console.error("enjoy follow-up failed for", key, e); } // stays queued, retried tomorrow
  }
  return new Response(`sent ${sent}`);
};

export const config = { schedule: "0 14 * * *" };
