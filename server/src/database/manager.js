import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

class DatabaseManager {
  constructor() {
    this.pool = null;
    this.initialized = false;
  }

  async connect(connectionStringOverride) {
    if (this.pool) return this.pool;

    const connectionString = connectionStringOverride || process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL is required in .env');
    }

    this.pool = new Pool({
      connectionString,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    // Test connection
    await this.pool.query('SELECT 1');
    console.log('Connected to PostgreSQL');

    return this.pool;
  }

  async initializeSchema(connectionStringOverride) {
    if (this.initialized) {
      console.log('Schema already initialized');
      return;
    }

    await this.connect(connectionStringOverride);

    console.log('Initializing NormalMemory schema...');

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Chat History
      await client.query(`
        CREATE TABLE IF NOT EXISTS chat_history (
          id SERIAL PRIMARY KEY,
          chat_id TEXT UNIQUE NOT NULL,
          user_id TEXT NOT NULL DEFAULT 'default',
          assistant_id TEXT,
          session_id TEXT NOT NULL DEFAULT 'default',
          user_input TEXT NOT NULL,
          ai_output TEXT NOT NULL,
          model TEXT DEFAULT 'unknown',
          tokens_used INTEGER DEFAULT 0,
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);

      // 2. Short-term Memory (conscious context)
      await client.query(`
        CREATE TABLE IF NOT EXISTS short_term_memory (
          memory_id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          session_id TEXT NOT NULL,
          content TEXT NOT NULL,
          summary TEXT NOT NULL,
          searchable_content TEXT NOT NULL,
          importance_score REAL DEFAULT 0.8,
          category TEXT DEFAULT 'conscious',
          expires_at TIMESTAMP,
          is_permanent BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT NOW(),
          search_vector TSVECTOR
        )
      `);

      // 3. Long-term Memory (the real brain)
      await client.query(`
        CREATE TABLE IF NOT EXISTS long_term_memory (
          memory_id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          content TEXT NOT NULL,
          summary TEXT NOT NULL,
          searchable_content TEXT NOT NULL,
          importance_score REAL DEFAULT 0.6,
          category TEXT DEFAULT 'general',
          classification TEXT DEFAULT 'conversational',
          memory_importance TEXT DEFAULT 'medium',
          entities JSONB DEFAULT '[]',
          keywords JSONB DEFAULT '[]',
          is_user_context BOOLEAN DEFAULT FALSE,
          is_preference BOOLEAN DEFAULT FALSE,
          is_skill_knowledge BOOLEAN DEFAULT FALSE,
          is_current_project BOOLEAN DEFAULT FALSE,
          promotion_eligible BOOLEAN DEFAULT FALSE,
          duplicate_of TEXT,
          related_memories JSONB DEFAULT '[]',
          confidence_score REAL DEFAULT 0.8,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          search_vector TSVECTOR
        )
      `);

      // Indexes - Critical for performance
      const indexes = [
        'CREATE INDEX IF NOT EXISTS idx_chat_user ON chat_history(user_id)',
        'CREATE INDEX IF NOT EXISTS idx_chat_session ON chat_history(session_id)',
        'CREATE INDEX IF NOT EXISTS idx_chat_created ON chat_history(created_at DESC)',

        'CREATE INDEX IF NOT EXISTS idx_short_user ON short_term_memory(user_id)',
        'CREATE INDEX IF NOT EXISTS idx_short_expires ON short_term_memory(expires_at)',
        'CREATE INDEX IF NOT EXISTS idx_short_importance ON short_term_memory(importance_score DESC)',
        'CREATE INDEX IF NOT EXISTS idx_short_search ON short_term_memory USING GIN(search_vector)',

        'CREATE INDEX IF NOT EXISTS idx_long_user ON long_term_memory(user_id)',
        'CREATE INDEX IF NOT EXISTS idx_long_importance ON long_term_memory(importance_score DESC)',
        'CREATE INDEX IF NOT EXISTS idx_long_classification ON long_term_memory(classification)',
        'CREATE INDEX IF NOT EXISTS idx_long_created ON long_term_memory(created_at DESC)',
        'CREATE INDEX IF NOT EXISTS idx_long_search ON long_term_memory USING GIN(search_vector)',
      ];

      for (const idx of indexes) {
        await client.query(idx);
      }

      // FTS: Auto-update search_vector
      await client.query(`
        CREATE OR REPLACE FUNCTION update_memory_search_vector() RETURNS TRIGGER AS $$
        BEGIN
          NEW.search_vector := 
            to_tsvector('english', COALESCE(NEW.searchable_content, '') || ' ' || COALESCE(NEW.summary, ''));
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
      `);

      // Triggers
      await client.query(`
        DROP TRIGGER IF EXISTS trigger_short_term_fts ON short_term_memory;
        CREATE TRIGGER trigger_short_term_fts
          BEFORE INSERT OR UPDATE ON short_term_memory
          FOR EACH ROW EXECUTE FUNCTION update_memory_search_vector();
      `);

      await client.query(`
        DROP TRIGGER IF EXISTS trigger_long_term_fts ON long_term_memory;
        CREATE TRIGGER trigger_long_term_fts
          BEFORE INSERT OR UPDATE ON long_term_memory
          FOR EACH ROW EXECUTE FUNCTION update_memory_search_vector();
      `);

      await client.query('COMMIT');
      this.initialized = true;
      console.log('NormalMemory schema initialized successfully!');
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Schema initialization failed:', err.message);
      throw err;
    } finally {
      client.release();
    }
  }

  async close() {
    if (this.pool) {
      await this.pool.end();
      console.log('Database connection closed');
    }
  }

  // Helper: Get pool (for other modules)
  getPool() {
    if (!this.pool) throw new Error('Database not connected. Call initializeSchema() first.');
    return this.pool;
  }
}

// Export singleton
export default new DatabaseManager();