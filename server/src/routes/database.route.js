import express from 'express'
import { initSchema, dbStatus, closeDb } from '../controllers/database.controller.js'

export const databaseRouter = express.Router()

databaseRouter.post('/init', initSchema)
databaseRouter.get('/status', dbStatus)
databaseRouter.post('/close', closeDb)


