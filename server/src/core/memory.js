import databaseManager from '../database/manager.js'
import crypto from 'crypto'

class MemoryCore {
  constructor(userId) {
    if (!userId) throw new Error('userId is required')
    this.userId = userId
  }

  async recordConversation({ userInput, aiOutput, model = 'gpt-4o', metadata = {} }) {
    const chatId = crypto.randomUUID()
    try {
      await databaseManager.connect()
      const pool = databaseManager.getPool()
      await pool.query(
        `INSERT INTO chat_history (chat_id, user_id, user_input, ai_output, model, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [chatId, this.userId, userInput, aiOutput, model, JSON.stringify(metadata || {})]
      )

      // fire-and-forget
      this.processMemoryAsync(chatId, userInput, aiOutput, model).catch(() => {})

      return { success: true, chatId }
    } catch (error) {
      console.error('Failed to record conversation:', error)
      throw error
    }
  }

  async processMemoryAsync(chatId, userInput, aiOutput, model) {
    try {
      await databaseManager.connect()
      const { extractMemories } = await import('../agents/memory-agent.js')
      const extracted = await extractMemories({
        userInput,
        aiOutput,
        userId: this.userId,
        chatId,
        model,
      })

      if (!extracted || !Array.isArray(extracted.memories) || extracted.memories.length === 0) {
        return
      }

      const pool = databaseManager.getPool()
      for (const mem of extracted.memories) {
        const memoryId = crypto.randomUUID()

        // Long-term memory
        await pool.query(
          `INSERT INTO long_term_memory (
            memory_id, user_id, content, summary, searchable_content, importance_score,
            classification, entities, keywords, created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())`,
          [
            memoryId,
            this.userId,
            mem.content,
            mem.summary,
            mem.searchable_text,
            Number(mem.importance_score ?? 0.6),
            mem.classification || 'conversational',
            JSON.stringify(mem.entities || []),
            JSON.stringify(mem.keywords || []),
          ]
        )

        // Promote to short-term if conscious or high-importance
        if (mem.is_conscious || Number(mem.importance_score ?? 0) > 0.85) {
          await pool.query(
            `INSERT INTO short_term_memory (
              memory_id, user_id, session_id, content, summary, searchable_content,
              importance_score, expires_at, is_permanent, created_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
            [
              memoryId,
              this.userId,
              'default',
              mem.content,
              mem.summary,
              mem.searchable_text,
              Number(mem.importance_score ?? 0.8),
              null,
              true,
            ]
          )
        }
      }
    } catch (error) {
      console.error('Memory processing failed:', error)
    }
  }

  async getContext(query = '', limit = 6) {
    try {
      await databaseManager.connect()
      const pool = databaseManager.getPool()
      let contextParts = []

      // Short-term memories (always-on user context)
      const shortRes = await pool.query(
        `SELECT summary
         FROM short_term_memory
         WHERE user_id = $1
         ORDER BY importance_score DESC, created_at DESC
         LIMIT 10`,
        [this.userId]
      )
      if (shortRes.rows.length > 0) {
        const list = shortRes.rows.map(r => `• ${r.summary}`).join('\n')
        contextParts.push(`User Context (Always Remember):\n${list}`)
      }

      // Relevant long-term memories via FTS
      const trimmed = (query || '').trim()
      if (trimmed) {
        const relevantRes = await pool.query(
          `SELECT summary, importance_score, created_at,
                  ts_rank(search_vector, plainto_tsquery('english', $2)) AS rank
           FROM long_term_memory
           WHERE user_id = $1
             AND search_vector @@ plainto_tsquery('english', $2)
           ORDER BY rank DESC, importance_score DESC, created_at DESC
           LIMIT $3`,
          [this.userId, trimmed, Math.max(1, Math.min(20, Number(limit) || 6))]
        )
        if (relevantRes.rows.length > 0) {
          const list = relevantRes.rows.map(r => `• ${r.summary}`).join('\n')
          contextParts.push(`Relevant Past Memories:\n${list}`)
        }
      }

      const context = contextParts.join('\n\n').trim()
      return context || 'No prior context available.'
    } catch (error) {
      console.error('getContext failed:', error)
      return 'Error retrieving context.'
    }
  }
}

export default MemoryCore


