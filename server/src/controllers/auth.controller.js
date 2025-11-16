import { db } from '../config/database.js'
import { users } from '../config/schema.js'
import { eq } from 'drizzle-orm'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'

export const register = async (req, res) => {
    const { name, email, password } = req.body
    try {
        const existingUser = await db.select().from(users).where(eq(users.email, email))
        if (existingUser.length > 0) {
            return res.status(400).json({ message: 'User already exists' })
        }
        const hashedPassword = await bcrypt.hash(password, 10)
        const user = await db.insert(users).values({ name, email, password: hashedPassword })
        return res.status(201).json({ message: 'User registered successfully', user })
    } catch (error) {
        console.log(error)
        return res.status(500).json({ message: 'Internal server error' })
    }
}

export const login = async (req, res) => {
    const { email, password } = req.body
    try {
        const userArr = await db.select().from(users).where(eq(users.email, email))
        if (userArr.length === 0) {
            return res.status(400).json({ message: 'User not found' })
        }
        const user = userArr[0]
        const isPasswordValid = await bcrypt.compare(password, user.password)
        if (!isPasswordValid) {
            return res.status(400).json({ message: 'Invalid password' })
        }

        const token = jwt.sign(
            { id: user.id, email: user.email, name: user.name },
            process.env.JWT_SECRET || 'secretkey',
            { expiresIn: '7d' }
        )

        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000,
        })

        return res.status(200).json({ message: 'Login successful', user: { id: user.id, name: user.name, email: user.email } })
    } catch (error) {
        console.log(error)
        return res.status(500).json({ message: 'Internal server error' })
    }
}
