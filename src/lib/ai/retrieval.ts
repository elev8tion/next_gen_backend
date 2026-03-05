import { CONFIG } from "@/lib/ncb-utils";

// ---------------------------------------------------------------------------
// NCB fetch helper (same pattern as rules-executor.ts)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Text chunking
// ---------------------------------------------------------------------------

/**
 * Split text into chunks at paragraph/sentence boundaries.
 * No external dependencies.
 */
export function chunkText(
  text: string,
  chunkSize = 512,
  overlap = 50
): string[] {
  if (!text || text.length === 0) return [];

  // Split on double-newlines (paragraphs) first, then sentences
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);

  const chunks: string[] = [];
  let current = "";

  for (const para of paragraphs) {
    // If adding this paragraph exceeds chunkSize, flush current
    if (current.length > 0 && current.length + para.length + 1 > chunkSize) {
      chunks.push(current.trim());
      // Keep overlap from the end of current
      if (overlap > 0 && current.length > overlap) {
        current = current.slice(-overlap) + "\n\n" + para;
      } else {
        current = para;
      }
    } else {
      current = current.length > 0 ? current + "\n\n" + para : para;
    }

    // If a single paragraph exceeds chunkSize, split by sentences
    if (current.length > chunkSize) {
      const sentences = current.match(/[^.!?]+[.!?]+\s*/g) || [current];
      let sentBuf = "";
      for (const sent of sentences) {
        if (sentBuf.length > 0 && sentBuf.length + sent.length > chunkSize) {
          chunks.push(sentBuf.trim());
          if (overlap > 0 && sentBuf.length > overlap) {
            sentBuf = sentBuf.slice(-overlap) + sent;
          } else {
            sentBuf = sent;
          }
        } else {
          sentBuf += sent;
        }
      }
      current = sentBuf;
    }
  }

  if (current.trim().length > 0) {
    chunks.push(current.trim());
  }

  return chunks;
}

// ---------------------------------------------------------------------------
// Embedding helpers
// ---------------------------------------------------------------------------

/**
 * Generate a zero-vector placeholder embedding.
 * Returns both base64 (for bytea storage) and number[] (for pgvector).
 */
export function generatePlaceholderEmbedding(dimensions = 1536): {
  base64: string;
  vector: number[];
  metadata: { placeholder: true };
} {
  const arr = new Float32Array(dimensions);
  // All zeros — placeholder
  const buffer = Buffer.from(arr.buffer);
  return {
    base64: buffer.toString("base64"),
    vector: Array.from(arr),
    metadata: { placeholder: true },
  };
}

function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function normalizeVector(vec: Float32Array): void {
  let sumSquares = 0;
  for (let i = 0; i < vec.length; i++) {
    sumSquares += vec[i] * vec[i];
  }
  const norm = Math.sqrt(sumSquares);
  if (norm === 0) return;
  for (let i = 0; i < vec.length; i++) {
    vec[i] /= norm;
  }
}

/**
 * Deterministic local embedding generator.
 * Uses hashed token features so query/index vectors share lexical semantics
 * without external API dependencies.
 */
export function generateLocalEmbedding(text: string, dimensions = 1536): {
  base64: string;
  vector: number[];
  metadata: { provider: "local-hash"; version: "v1"; empty?: true };
} {
  const vec = new Float32Array(dimensions);
  const tokens = (text || "")
    .toLowerCase()
    .match(/[a-z0-9_]+/g) || [];

  if (tokens.length === 0) {
    const buffer = Buffer.from(vec.buffer);
    return {
      base64: buffer.toString("base64"),
      vector: Array.from(vec),
      metadata: { provider: "local-hash", version: "v1", empty: true },
    };
  }

  for (const token of tokens) {
    const h1 = fnv1a32(token) % dimensions;
    const h2 = fnv1a32(`${token}:2`) % dimensions;
    const w = Math.min(3, Math.max(1, token.length / 4));
    vec[h1] += w;
    vec[h2] -= w * 0.35;
  }

  normalizeVector(vec);
  const buffer = Buffer.from(vec.buffer);
  return {
    base64: buffer.toString("base64"),
    vector: Array.from(vec),
    metadata: { provider: "local-hash", version: "v1" },
  };
}

export interface SemanticEmbeddingResult {
  base64: string;
  vector: number[];
  metadata: Record<string, unknown>;
  model: string;
}

async function tryOpenAIEmbedding(
  text: string,
  dimensions = 1536
): Promise<SemanticEmbeddingResult | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const model = process.env.RETRIEVAL_EMBEDDING_MODEL || "text-embedding-3-small";
  const payload = {
    model,
    input: text,
    dimensions,
  };

  try {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return null;

    const data = (await res.json()) as {
      data?: Array<{ embedding?: number[] }>;
      model?: string;
    };
    const embedding = data.data?.[0]?.embedding;
    if (!embedding || !Array.isArray(embedding) || embedding.length === 0) {
      return null;
    }

    const vec = new Float32Array(embedding.length);
    for (let i = 0; i < embedding.length; i++) {
      vec[i] = Number(embedding[i]) || 0;
    }
    normalizeVector(vec);

    return {
      base64: Buffer.from(vec.buffer).toString("base64"),
      vector: Array.from(vec),
      metadata: { provider: "openai", version: "v1" },
      model: data.model || model,
    };
  } catch {
    return null;
  }
}

export async function generateSemanticEmbedding(
  text: string,
  dimensions = 1536
): Promise<SemanticEmbeddingResult> {
  const openAi = await tryOpenAIEmbedding(text, dimensions);
  if (openAi) return openAi;

  const local = generateLocalEmbedding(text, dimensions);
  return {
    base64: local.base64,
    vector: local.vector,
    metadata: local.metadata,
    model: "local-hash-embedding-v1",
  };
}

/**
 * Cosine similarity between two number[] vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dotProduct / denom;
}

/**
 * Decode base64 bytea back to number[].
 */
export function decodeBytea(base64: string): number[] {
  const buffer = Buffer.from(base64, "base64");
  const floats = new Float32Array(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength / 4
  );
  return Array.from(floats);
}

// ---------------------------------------------------------------------------
// indexDocument pipeline
// ---------------------------------------------------------------------------

export interface IndexDocumentInput {
  collection_id: string;
  title: string;
  content: string;
  source_type?: string;
  source_url?: string;
  metadata?: Record<string, unknown>;
  entity_ref?: {
    entity_type: string;
    entity_id: string;
    link_type?: string;
  };
}

export interface IndexDocumentOptions {
  chunk_size?: number;
  chunk_overlap?: number;
  embedding_dimensions?: number;
}

export interface IndexDocumentResult {
  document_id: string;
  chunk_count: number;
  status: string;
}

/**
 * Full indexing pipeline:
 * 1. Create knowledge_documents record (status: "processing")
 * 2. Split content into chunks
 * 3. Create knowledge_chunks records
 * 4. Create knowledge_embeddings records
 * 5. Update document status to "indexed" with chunk_count
 * 6. Create knowledge_links record if entity_ref provided
 */
export async function indexDocument(
  input: IndexDocumentInput,
  authCookies: string,
  origin: string,
  options?: IndexDocumentOptions
): Promise<IndexDocumentResult> {
  const chunkSize = options?.chunk_size ?? 512;
  const chunkOverlap = options?.chunk_overlap ?? 50;
  const embeddingDimensions = options?.embedding_dimensions ?? 1536;

  // 1. Create document record
  const doc = await ncbFetch(
    "create/knowledge_documents",
    authCookies,
    origin,
    "POST",
    {
      collection_id: input.collection_id,
      title: input.title,
      content: input.content,
      source_type: input.source_type ?? "manual",
      source_url: input.source_url ?? null,
      metadata: input.metadata ?? null,
      status: "processing",
      chunk_count: 0,
    }
  );

  const documentId = doc.id;

  // 2. Chunk content
  const chunks = chunkText(input.content, chunkSize, chunkOverlap);

  // 3. Create chunk records + 4. Create embedding records
  for (let i = 0; i < chunks.length; i++) {
    const chunkContent = chunks[i];
    // Rough token count estimate (~4 chars per token)
    const tokenCount = Math.ceil(chunkContent.length / 4);

    const chunkRecord = await ncbFetch(
      "create/knowledge_chunks",
      authCookies,
      origin,
      "POST",
      {
        document_id: documentId,
        chunk_index: i,
        content: chunkContent,
        token_count: tokenCount,
        metadata: null,
      }
    );

    // Create deterministic local embedding
    const embedding = await generateSemanticEmbedding(chunkContent, embeddingDimensions);
    await ncbFetch(
      "create/knowledge_embeddings",
      authCookies,
      origin,
      "POST",
      {
        chunk_id: chunkRecord.id,
        model: embedding.model,
        vector: embedding.base64,
        metadata: embedding.metadata,
      }
    );
  }

  // 5. Update document status to indexed
  await ncbFetch(
    `update/knowledge_documents?id=eq.${documentId}`,
    authCookies,
    origin,
    "PATCH",
    {
      status: "indexed",
      chunk_count: chunks.length,
    }
  );

  // 6. Create knowledge_links if entity_ref provided
  if (input.entity_ref) {
    await ncbFetch(
      "create/knowledge_links",
      authCookies,
      origin,
      "POST",
      {
        document_id: documentId,
        entity_type: input.entity_ref.entity_type,
        entity_id: input.entity_ref.entity_id,
        link_type: input.entity_ref.link_type ?? "source",
      }
    );
  }

  return {
    document_id: documentId,
    chunk_count: chunks.length,
    status: "indexed",
  };
}
