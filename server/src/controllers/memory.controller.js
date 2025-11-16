import MemoryCore from '../core/memory.js'
import { openai } from '../utils/openai.js'
import { db } from '../config/database.js'
import { userDatabases } from '../config/schema.js'
import { eq } from 'drizzle-orm'
import databaseManager from '../database/manager.js'
import { SEARCH_MEMORIES_FTS } from '../database/queries.js'
import { rankResults } from '../utils/ranking.js'

export const recordConversation = async (req, res) => {
  try {
    const userId = req.user?.id
    if (!userId) return res.status(401).json({ message: 'Unauthorized' })

    let databaseUrl
    try {
      const rows = await db.select().from(userDatabases).where(eq(userDatabases.userId, userId))
      if (rows.length > 0 && rows[0].databaseUrl) {
        databaseUrl = rows[0].databaseUrl
      }
    } catch {}
    if (!databaseUrl) {
      return res.status(400).json({ message: 'Database not configured for user. Initialize via /api/db/init first.' })
    }
    await databaseManager.connect(databaseUrl)

    const { userInput, aiOutput: aiOutputIn, model = 'gpt-4o', metadata = {} } = req.body || {}
    if (!userInput) {
      return res.status(400).json({ message: 'userInput is required' })
    }

    const memory = new MemoryCore(String(userId))
    let aiOutput = aiOutputIn

    // If AI output not provided, generate it using context + OpenAI (fallback to heuristic)
    if (!aiOutput) {
      const context = await memory.getContext(userInput, 6)
      if (openai && process.env.OPENAI_API_KEY) {
        try {
          const prompt = [
            'You are NormalMemory assistant. Respond concisely and helpfully.',
            'Use the provided user context if relevant.',
            `User Context:\n${context}\n`,
            `User: ${userInput}`,
          ].join('\n\n')
          const completion = await openai.chat.completions.create({
            model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
            temperature: 0.7,
            messages: [
              { role: 'system', content: 'Helpful assistant for conversational memory app.' },
              { role: 'user', content: prompt },
            ],
          })
          aiOutput = completion?.choices?.[0]?.message?.content?.trim() || ''
        } catch (e) {
          aiOutput = ''
        }
      }
      if (!aiOutput) {
        // Heuristic fallback if no OpenAI
        aiOutput = 'Noted. I will remember this.'
      }
    }

    const result = await memory.recordConversation({ userInput, aiOutput, model, metadata })
    return res.status(200).json(result)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ message: 'Failed to record conversation' })
  }
}

export const getContext = async (req, res) => {
  try {
    const userId = req.user?.id
    if (!userId) return res.status(401).json({ message: 'Unauthorized' })

    let databaseUrl
    try {
      const rows = await db.select().from(userDatabases).where(eq(userDatabases.userId, userId))
      if (rows.length > 0 && rows[0].databaseUrl) {
        databaseUrl = rows[0].databaseUrl
      }
    } catch {}
    if (!databaseUrl) {
      return res.status(400).json({ message: 'Database not configured for user. Initialize via /api/db/init first.' })
    }
    await databaseManager.connect(databaseUrl)

    const query = String(req.query.query || '')
    const limit = Number(req.query.limit || 6)

    const memory = new MemoryCore(String(userId))
    const context = await memory.getContext(query, limit)
    return res.status(200).json({ context })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ message: 'Failed to retrieve context' })
  }
}

export const search = async (req, res) => {
  try {
    const userId = req.user?.id
    if (!userId) return res.status(401).json({ message: 'Unauthorized' })

    let databaseUrl
    try {
      const rows = await db.select().from(userDatabases).where(eq(userDatabases.userId, userId))
      if (rows.length > 0 && rows[0].databaseUrl) {
        databaseUrl = rows[0].databaseUrl
      }
    } catch {}
    if (!databaseUrl) {
      return res.status(400).json({ message: 'Database not configured for user. Initialize via /api/db/init first.' })
    }
    await databaseManager.connect(databaseUrl)
    const pool = databaseManager.getPool()

    const query = String(req.query.query || '')
    const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 10))
    if (!query.trim()) {
      return res.status(400).json({ message: 'query is required' })
    }

    const result = await pool.query(SEARCH_MEMORIES_FTS, [String(userId), query, limit])
    const rows = result.rows.map(r => ({
      memoryId: r.memory_id,
      userId: r.user_id,
      summary: r.summary,
      searchableContent: r.searchable_content,
      importanceScore: Number(r.importance_score || 0),
      classification: r.classification,
      entities: r.entities,
      keywords: r.keywords,
      createdAt: r.created_at,
      searchScore: Number(r.rank || 0),
    }))
    const ranked = rankResults(rows)
    return res.status(200).json({ results: ranked })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ message: 'Failed to search memories' })
  }
}


