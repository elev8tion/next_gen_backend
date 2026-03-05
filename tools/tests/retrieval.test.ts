import assert from "node:assert/strict";
import {
  chunkText,
  generateLocalEmbedding,
  generateSemanticEmbedding,
  cosineSimilarity,
  decodeBytea,
} from "../../src/lib/ai/retrieval";

function approxEqual(a: number, b: number, epsilon = 1e-6): boolean {
  return Math.abs(a - b) <= epsilon;
}

async function run() {
  // chunking: produces multiple chunks and non-empty content
  const longText = [
    "Apple banana cherry date.",
    "Oranges are citrus fruits rich in vitamin C.",
    "Grapes can be green or purple.",
    "Cars and engines are unrelated to fruit.",
  ].join("\n\n");

  const chunks = chunkText(longText, 80, 10);
  assert.ok(chunks.length >= 2, "chunkText should split long text");
  assert.ok(chunks.every((c) => c.trim().length > 0), "chunkText should not emit empty chunks");

  // local embedding: deterministic for same input
  const emb1 = generateLocalEmbedding("apple orange banana", 128);
  const emb2 = generateLocalEmbedding("apple orange banana", 128);
  assert.equal(emb1.vector.length, 128, "embedding should respect requested dimension");
  assert.equal(emb1.base64, emb2.base64, "same input should generate identical embedding bytes");

  // decode round-trip
  const decoded = decodeBytea(emb1.base64);
  assert.equal(decoded.length, 128, "decoded vector should have correct dimension");
  assert.ok(approxEqual(decoded[0], emb1.vector[0]), "decoded values should match encoded values");

  // similarity: related text should score higher than unrelated text
  const query = generateLocalEmbedding("fresh apple fruit", 128);
  const related = generateLocalEmbedding("apple and banana fruit basket", 128);
  const unrelated = generateLocalEmbedding("diesel engine transmission vehicle", 128);

  const relatedScore = cosineSimilarity(query.vector, related.vector);
  const unrelatedScore = cosineSimilarity(query.vector, unrelated.vector);
  assert.ok(
    relatedScore > unrelatedScore,
    `related score (${relatedScore}) should be > unrelated score (${unrelatedScore})`
  );

  // semantic embedding fallback path should use local model without API key
  const originalKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  const semantic = await generateSemanticEmbedding("test semantic embedding", 96);
  if (originalKey) process.env.OPENAI_API_KEY = originalKey;

  assert.equal(semantic.model, "local-hash-embedding-v1", "should fallback to local model when API key is missing");
  assert.equal(semantic.vector.length, 96, "semantic embedding should respect dimensions");

  console.log("retrieval tests passed");
}

run().catch((err) => {
  console.error("retrieval tests failed");
  console.error(err);
  process.exit(1);
});
