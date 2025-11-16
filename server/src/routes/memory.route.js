import express from 'express'
import { requireAuth } from '../middleware/auth.js'
import { recordConversation, getContext, search } from '../controllers/memory.controller.js'

export const memoryRouter = express.Router()

memoryRouter.post('/record', requireAuth, recordConversation)
memoryRouter.get('/context', requireAuth, getContext)
memoryRouter.get('/search', requireAuth, search)


