import crypto from 'crypto'
import { openai } from '../utils/openai.js'

const CLASSIFICATIONS = [
  'conscious-info',
  'essential',
  'contextual',
  'conversational',
  'reference',
  'personal',
]

const IMPORTANCE_THRESHOLDS = {
  critical: 0.95,
  high: 0.85,
  medium: 0.65,
  low: 0.45,
}

function normalizeText(s) {
  return String(s || '').trim().replace(/\s+/g, ' ')
}

function jaccardSimilarity(a, b) {
  const setA = new Set(normalizeText(a).toLowerCase().split(/\W+/).filter(Boolean))
  const setB = new Set(normalizeText(b).toLowerCase().split(/\W+/).filter(Boolean))
  const inter = new Set([...setA].filter(x => setB.has(x)))
  const union = new Set([...setA, ...setB])
  return union.size === 0 ? 0 : inter.size / union.size
}

function classifyMemory(content) {
  const text = normalizeText(content).toLowerCase()
  if (/my name is|i am .*years old|i work as|i live in|favorite|i like|i love/.test(text)) {
    return 'conscious-info'
  }
  if (/deadline|must|need to|important|priority|remember to/.test(text)) {
    return 'essential'
  }
  if (/working on|current project|today i|this week|context/.test(text)) {
    return 'contextual'
  }
  if (/see docs|snippet|example|stack overflow|reference/.test(text)) {
    return 'reference'
  }
  if (/birthday|family|friend|wedding|vacation|life/.test(text)) {
    return 'personal'
  }
  return 'conversational'
}

function scoreImportance(memory) {
  const text = normalizeText(memory)
  let score = 0.6
  const lower = text.toLowerCase()
  if (lower.includes('must') || lower.includes('important') || lower.includes('critical')) {
    score = Math.max(score, 0.9)
  }
  if (lower.includes('remember')) {
    score = Math.max(score, 0.8)
  }
  if (lower.includes('favorite') || lower.includes('i love') || lower.includes('i like')) {
    score = Math.max(score, 0.75)
  }
  if (lower.includes('deadline') || lower.includes('tomorrow') || lower.includes('today')) {
    score = Math.max(score, 0.85)
  }
  return Math.min(0.99, Math.max(0.4, score))
}

function importanceLabelFromScore(score) {
  if (score >= IMPORTANCE_THRESHOLDS.critical) return 'critical'
  if (score >= IMPORTANCE_THRESHOLDS.high) return 'high'
  if (score >= IMPORTANCE_THRESHOLDS.medium) return 'medium'
  return 'low'
}

function extractEntities(content) {
  const text = normalizeText(content)
  const entities = []
  const keywords = new Set()

  // Very naive entity extraction (Phase 3 baseline)
  const people = [...text.matchAll(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g)]
    .map(m => m[1])
    .filter(n => n.length > 1)
  for (const p of people) entities.push({ type: 'person', value: p })

  // Tech/topics keywords
  const topical = ['aws', 'gcp', 'azure', 'postgres', 'mysql', 'drizzle', 'react', 'next.js', 'node', 'python', 'golang', 'rust', 'kubernetes', 'docker']
  for (const t of topical) {
    if (text.toLowerCase().includes(t)) keywords.add(t)
  }

  // Simple noun-like words as keywords
  for (const w of text.toLowerCase().split(/\W+/).filter(Boolean)) {
    if (w.length > 3 && !['this','that','with','from','have','were','them','they','been','will','there','about','which','because','while','after','before','when'].includes(w)) {
      keywords.add(w)
    }
  }

  return { entities, keywords: [...keywords].slice(0, 25) }
}

function detectDuplicates(newMemory, existingSummaries = []) {
  // Detect if new summary is very similar to any existing summaries
  const newSum = normalizeText(newMemory.summary || newMemory.content || '')
  for (const ex of existingSummaries) {
    const sim = jaccardSimilarity(newSum, ex)
    if (sim >= 0.9) {
      return { isDuplicate: true, duplicateOf: ex, similarity: sim }
    }
  }
  return { isDuplicate: false, similarity: 0 }
}

async function callOpenAI(userInput, aiOutput, context) {
  if (!openai) return null
  try {
    const prompt = [
      'You are a Memory Extraction Agent. Convert the conversation into structured memories.',
      'Return strict JSON { memories: [ { content, summary, searchable_text, classification, importance_score, entities, keywords, is_conscious } ] }',
      'Classification: conscious-info | essential | contextual | conversational | reference | personal',
      'Importance score: 0.0 - 1.0',
      'Entities: [{ type, value }], Keywords: [string]',
      'The summary should be concise and human-readable.',
      context ? `Context:\n${context}\n` : '',
      `User Input: ${userInput}`,
      `AI Output: ${aiOutput}`,
    ].filter(Boolean).join('\n\n')

    const res = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      temperature: 0.2,
      messages: [
        { role: 'system', content: 'You transform conversations into structured long-term memories for retrieval.' },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
    })
    const content = res?.choices?.[0]?.message?.content
    if (!content) return null
    const parsed = JSON.parse(content)
    if (!parsed || !Array.isArray(parsed.memories)) return null
    return parsed
  } catch (err) {
    // Fall back if OpenAI fails
    return null
  }
}

async function processConversation(conversation, context) {
  const { userInput, aiOutput } = conversation
  let structured = await callOpenAI(userInput, aiOutput, context)

  // Fallback: manual parsing heuristics
  if (!structured) {
    const combined = `${normalizeText(userInput)} ${normalizeText(aiOutput)}`.trim()
    const classification = classifyMemory(combined)
    const importance_score = scoreImportance(combined)
    const { entities, keywords } = extractEntities(combined)
    structured = {
      memories: [{
        content: combined,
        summary: combined.slice(0, 180),
        searchable_text: combined.toLowerCase(),
        classification,
        importance_score,
        entities,
        keywords,
        is_conscious: classification === 'conscious-info' || importance_score >= IMPORTANCE_THRESHOLDS.high,
      }],
    }
  } else {
    // Validate / normalize structured fields
    structured.memories = structured.memories.map(m => {
      const content = normalizeText(m.content || `${userInput} ${aiOutput}`)
      const summary = normalizeText(m.summary || content.slice(0, 180))
      const searchable_text = String(m.searchable_text || content).toLowerCase()
      const classification = CLASSIFICATIONS.includes(m.classification) ? m.classification : classifyMemory(content)
      const importance_score = Math.min(0.99, Math.max(0, Number(m.importance_score ?? scoreImportance(content))))
      const ents = Array.isArray(m.entities) ? m.entities : []
      const keys = Array.isArray(m.keywords) ? m.keywords : []
      const conscious = Boolean(m.is_conscious) || classification === 'conscious-info' || importance_score >= IMPORTANCE_THRESHOLDS.high
      return {
        content,
        summary,
        searchable_text,
        classification,
        importance_score,
        entities: ents,
        keywords: keys,
        is_conscious: conscious,
      }
    })
  }

  return structured
}

export async function extractMemories({ userInput, aiOutput, userId, chatId, model, context = '' }) {
  try {
    const conversation = { userInput, aiOutput, userId, chatId, model }
    const result = await processConversation(conversation, context)
    // Dedup pass can be performed by caller using existing summaries; here we return structured result
    return {
      memories: result.memories || [],
    }
  } catch (err) {
    // Never break caller flow
    return { memories: [] }
  }
}

// Named exports for unit use if needed
export { processConversation, classifyMemory, scoreImportance, extractEntities, detectDuplicates }


