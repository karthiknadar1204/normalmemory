// Centralized parameterized SQL queries for search & retrieval
// Use with pg Pool: pool.query(text, values)

export const SEARCH_MEMORIES_FTS = `
  SELECT
    ltm.memory_id,
    ltm.user_id,
    ltm.summary,
    ltm.searchable_content,
    ltm.importance_score,
    ltm.classification,
    ltm.entities,
    ltm.keywords,
    ltm.created_at,
    ts_rank(ltm.search_vector, plainto_tsquery('english', $2)) AS rank
  FROM long_term_memory ltm
  WHERE ltm.user_id = $1
    AND ltm.search_vector @@ plainto_tsquery('english', $2)
  ORDER BY rank DESC, importance_score DESC, created_at DESC
  LIMIT $3
`;

export const GET_SHORT_TERM_MEMORIES = `
  SELECT
    memory_id,
    user_id,
    summary,
    searchable_content,
    importance_score,
    expires_at,
    is_permanent,
    created_at
  FROM short_term_memory
  WHERE user_id = $1
  ORDER BY importance_score DESC, created_at DESC
  LIMIT $2
`;

export const GET_RECENT_MEMORIES = `
  SELECT
    memory_id,
    user_id,
    summary,
    searchable_content,
    importance_score,
    created_at
  FROM long_term_memory
  WHERE user_id = $1
  ORDER BY created_at DESC
  LIMIT $2
`;

export const GET_MEMORY_STATS = `
  SELECT
    (SELECT COUNT(*) FROM chat_history WHERE user_id = $1) AS total_chats,
    (SELECT COUNT(*) FROM long_term_memory WHERE user_id = $1) AS total_long_term,
    (SELECT COUNT(*) FROM short_term_memory WHERE user_id = $1) AS total_short_term,
    (SELECT COALESCE(AVG(importance_score),0) FROM long_term_memory WHERE user_id = $1) AS avg_importance
`;

export const CLEANUP_EXPIRED_SHORT_TERM = `
  DELETE FROM short_term_memory
  WHERE user_id = $1
    AND expires_at IS NOT NULL
    AND expires_at < NOW()
  RETURNING memory_id
`;

// Helper wrappers (optional)
export async function searchMemories(pool, { userId, query, limit = 10 }) {
  return pool.query(SEARCH_MEMORIES_FTS, [String(userId), String(query || ''), Math.max(1, Math.min(50, Number(limit) || 10))])
}

export async function listShortTerm(pool, { userId, limit = 10 }) {
  return pool.query(GET_SHORT_TERM_MEMORIES, [String(userId), Math.max(1, Math.min(50, Number(limit) || 10))])
}

export async function listRecentLongTerm(pool, { userId, limit = 20 }) {
  return pool.query(GET_RECENT_MEMORIES, [String(userId), Math.max(1, Math.min(200, Number(limit) || 20))])
}

export async function getStats(pool, { userId }) {
  return pool.query(GET_MEMORY_STATS, [String(userId)])
}

export async function cleanupExpiredShortTerm(pool, { userId }) {
  return pool.query(CLEANUP_EXPIRED_SHORT_TERM, [String(userId)])
}


