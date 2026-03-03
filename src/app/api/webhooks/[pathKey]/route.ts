import { NextRequest, NextResponse } from "next/server";
import { CONFIG } from "@/lib/ncb-utils";
import { createHmac } from "crypto";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ pathKey: string }> }
) {
  const { pathKey } = await params;

  // Look up webhook config (public read)
  const webhookUrl = `${CONFIG.dataApiUrl}/read/inbound_webhooks?Instance=${CONFIG.instance}&path_key=eq.${pathKey}&is_active=eq.true`;
  const webhookRes = await fetch(webhookUrl, {
    headers: {
      "Content-Type": "application/json",
      "X-Database-Instance": CONFIG.instance,
    },
  });

  const webhooks = await webhookRes.json();
  if (!Array.isArray(webhooks) || !webhooks.length) {
    return NextResponse.json({ error: "Webhook not found" }, { status: 404 });
  }

  const webhook = webhooks[0] as {
    id: string;
    event_name: string;
    secret?: string;
    user_id?: string;
  };

  // Verify HMAC if secret is set
  if (webhook.secret) {
    const signature = req.headers.get("x-webhook-signature") || "";
    const bodyText = await req.text();
    const expected = createHmac("sha256", webhook.secret).update(bodyText).digest("hex");
    if (signature !== expected) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
    }
    // Re-parse body since we consumed it
    const payload = JSON.parse(bodyText);
    return await insertEvent(webhook, payload);
  }

  const payload = await req.json();
  return await insertEvent(webhook, payload);
}

async function insertEvent(
  webhook: { id: string; event_name: string; user_id?: string },
  payload: Record<string, unknown>
) {
  const res = await fetch(`${CONFIG.dataApiUrl}/create/events?Instance=${CONFIG.instance}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Database-Instance": CONFIG.instance,
    },
    body: JSON.stringify({
      event_name: webhook.event_name,
      entity_type: "webhook",
      payload: { ...payload, webhook_id: webhook.id },
      user_id: webhook.user_id || null,
    }),
  });

  const data = await res.json();
  return NextResponse.json({ received: true, event_id: data.id }, { status: 201 });
}
