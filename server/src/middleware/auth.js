import jwt from 'jsonwebtoken'

export const requireAuth = (req, res, next) => {
  const token = req.cookies?.token
  if (!token) {
    return res.status(401).json({ message: 'Unauthorized' })
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'secretkey')
    req.user = payload
    return next()
  } catch (err) {
    return res.status(401).json({ message: 'Invalid token' })
  }
}


