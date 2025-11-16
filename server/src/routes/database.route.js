import express from 'express'
import { initSchema, dbStatus, closeDb } from '../controllers/database.controller.js'
import { requireAuth } from '../middleware/auth.js'

export const databaseRouter = express.Router()

databaseRouter.post('/init', requireAuth, initSchema)
databaseRouter.get('/status', dbStatus)
databaseRouter.post('/close', closeDb)


