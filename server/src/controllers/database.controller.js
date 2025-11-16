import databaseManager from '../database/manager.js'

export const initSchema = async (req, res) => {
  const { databaseUrl } = req.body || {}
  if (!databaseUrl && !process.env.DATABASE_URL) {
    return res.status(400).json({ message: 'databaseUrl is required' })
  }
  try {
    if (databaseManager.initialized) {
      return res.status(200).json({ message: 'Schema already initialized', initialized: true })
    }
    await databaseManager.initializeSchema(databaseUrl)
    return res.status(200).json({ message: 'Schema initialized', initialized: true })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ message: 'Failed to initialize schema' })
  }
}

export const dbStatus = async (_req, res) => {
  let connected = false
  try {
    const pool = databaseManager.getPool()
    connected = !!pool
  } catch {
    connected = false
  }
  return res.status(200).json({
    connected,
    initialized: Boolean(databaseManager.initialized),
  })
}

export const closeDb = async (_req, res) => {
  try {
    await databaseManager.close()
    return res.status(200).json({ message: 'Database connection closed' })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ message: 'Failed to close database connection' })
  }
}


