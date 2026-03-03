import { NextRequest, NextResponse } from "next/server";
import { CONFIG, extractAuthCookies, getSessionUser, unwrapNCBArray } from "@/lib/ncb-utils";
import {
  generatePlaceholderEmbedding,
  cosineSimilarity,
  decodeBytea,
} from "@/lib/ai/retrieval";

async function ncbFetch(
  path: string,
  authCookies: string,
  origin: string,
  method = "GET",
  body?: unknown
) {
  const url = `${CONFIG.dataApiUrl}/${path}?Instance=${CONFIG.instance}`;
  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Database-Instance": CONFIG.instance,
      Cookie: authCookies,
      Origin: origin,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

export async function POST(req: NextRequest) {
  const cookieHeader = req.headers.get("cookie") || "";
  const user = await getSessionUser(cookieHeader);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const authCookies = extractAuthCookies(cookieHeader);
  const origin = req.headers.get("origin") || req.nextUrl.origin;

  const body = await req.json();
  const { collection_id, query_text, top_k = 5 } = body;

  if (!collection_id || !query_text) {
    return NextResponse.json(
      { error: "collection_id and query_text are required" },
      { status: 400 }
    );
  }

  // 1. Generate query embedding (placeholder zero vector for now)
  const queryEmbedding = generatePlaceholderEmbedding(1536);

  // 2. Fetch indexed documents in collection
  const docsRaw = await ncbFetch(
    `read/knowledge_documents?collection_id=eq.${collection_id}&status=eq.indexed`,
    authCookies,
    origin
  );
  const docs = unwrapNCBArray<{ id: string; title: string; source_type: string; source_url: string }>(docsRaw);

  if (docs.length === 0) {
    return NextResponse.json({
      results: [],
      query_text,
      collection_id,
      top_k,
    });
  }

  const docIds = docs.map((d) => d.id);
  const docMap = new Map(docs.map((d) => [d.id, d]));

  // 3. Fetch chunks for those documents
  const chunksRaw = await ncbFetch(
    `read/knowledge_chunks?document_id=in.(${docIds.join(",")})`,
    authCookies,
    origin
  );
  const chunks = unwrapNCBArray<{
    id: string;
    document_id: string;
    chunk_index: number;
    content: string;
  }>(chunksRaw);

  if (chunks.length === 0) {
    return NextResponse.json({
      results: [],
      query_text,
      collection_id,
      top_k,
    });
  }

  const chunkIds = chunks.map((c) => c.id);
  const chunkMap = new Map(chunks.map((c) => [c.id, c]));

  // 4. Fetch embeddings
  const embeddingsRaw = await ncbFetch(
    `read/knowledge_embeddings?chunk_id=in.(${chunkIds.join(",")})`,
    authCookies,
    origin
  );
  const embeddings = unwrapNCBArray<{
    id: string;
    chunk_id: string;
    vector: string;
    metadata: Record<string, unknown> | null;
  }>(embeddingsRaw);

  // 5. Compute similarity
  const scored: {
    similarity: number;
    chunk_content: string;
    document_title: string;
    document_id: string;
    chunk_id: string;
  }[] = [];

  for (const emb of embeddings) {
    const chunk = chunkMap.get(emb.chunk_id);
    if (!chunk) continue;

    const doc = docMap.get(chunk.document_id);
    if (!doc) continue;

    let embVector: number[];
    try {
      embVector = decodeBytea(emb.vector);
    } catch {
      // If vector isn't valid base64 bytea, try parsing as JSON array
      try {
        embVector = JSON.parse(emb.vector);
      } catch {
        continue;
      }
    }

    const similarity = cosineSimilarity(queryEmbedding.vector, embVector);

    scored.push({
      similarity,
      chunk_content: chunk.content,
      document_title: doc.title,
      document_id: chunk.document_id,
      chunk_id: chunk.id,
    });
  }

  // 6. Sort by similarity descending, take top_k
  scored.sort((a, b) => b.similarity - a.similarity);
  const results = scored.slice(0, top_k);

  return NextResponse.json({
    results,
    query_text,
    collection_id,
    top_k,
  });
}
