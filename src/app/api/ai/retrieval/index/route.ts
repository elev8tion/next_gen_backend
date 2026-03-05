import { NextRequest, NextResponse } from "next/server";
import { extractAuthCookies, getSessionUser } from "@/lib/ncb-utils";
import { indexDocument, type IndexDocumentInput, type IndexDocumentOptions } from "@/lib/ai/retrieval";

export async function POST(req: NextRequest) {
  const cookieHeader = req.headers.get("cookie") || "";
  const user = await getSessionUser(cookieHeader);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const authCookies = extractAuthCookies(cookieHeader);
  const origin = req.headers.get("origin") || req.nextUrl.origin;

  const body = await req.json();
  const {
    collection_id,
    title,
    content,
    source_type,
    source_url,
    metadata,
    entity_ref,
    options,
  } = body || {};

  if (!collection_id || !title || !content) {
    return NextResponse.json(
      { error: "collection_id, title, and content are required" },
      { status: 400 }
    );
  }

  const input: IndexDocumentInput = {
    collection_id,
    title,
    content,
    source_type,
    source_url,
    metadata,
    entity_ref,
  };

  const indexOptions: IndexDocumentOptions | undefined = options;

  const result = await indexDocument(input, authCookies, origin, indexOptions);

  return NextResponse.json({ indexed: result });
}
