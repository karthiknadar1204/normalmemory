import express from 'express'
import dotenv from 'dotenv'
import { authRouter } from './routes/auth.route.js'
import { databaseRouter } from './routes/database.route.js'
import cors from 'cors'
import cookieParser from 'cookie-parser'
dotenv.config()

const PORT=process.env.PORT;

const app=express()
app.use(cors())
app.use(express.json())
app.use(cookieParser())
app.use('/api/auth',authRouter)
app.use('/api/db',databaseRouter)

app.listen(PORT,()=>{
    console.log(`Server is running on port ${PORT}`)
})