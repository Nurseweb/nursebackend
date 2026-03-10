import type { Request, Response } from "express"
import bcrypt from "bcryptjs"
import { pool } from "../config/db.js"

// GET /api/admin/users
export async function getUsers(req: Request, res: Response) {
  try {
    const { rows } = await pool.query(
      `SELECT id, email, phone, name, role, is_active, created_at, updated_at
       FROM users
       WHERE deleted_at IS NULL
       ORDER BY created_at DESC`
    )
    return res.json(rows)
  } catch (err) {
    return res.status(500).json({ message: "Серверийн алдаа гарлаа." })
  }
}

// PATCH /api/admin/users/:id/toggle
export async function toggleUserStatus(req: Request, res: Response) {
  const { id } = req.params
  try {
    const { rows } = await pool.query(
      `UPDATE users SET is_active = NOT is_active
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING id, email, is_active`,
      [id]
    )
    if (rows.length === 0) {
      return res.status(404).json({ message: "Хэрэглэгч олдсонгүй." })
    }
    return res.json({ message: "Статус өөрчлөгдлөө.", user: rows[0] })
  } catch (err) {
    return res.status(500).json({ message: "Серверийн алдаа гарлаа." })
  }
}

// DELETE /api/admin/users/:id — soft delete
export async function deleteUser(req: Request, res: Response) {
  const { id } = req.params
  try {
    const { rows } = await pool.query(
      `UPDATE users SET deleted_at = NOW(), is_active = false
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING id, email`,
      [id]
    )
    if (rows.length === 0) {
      return res.status(404).json({ message: "Хэрэглэгч олдсонгүй." })
    }
    return res.json({ message: "Хэрэглэгч устгагдлаа (soft delete).", user: rows[0] })
  } catch (err) {
    return res.status(500).json({ message: "Серверийн алдаа гарлаа." })
  }
}

// POST /api/admin/users — admin creates user
export async function createUser(req: Request, res: Response) {
  const { email, phone, password, name } = req.body
  if (!email || !phone || !password || !name) {
    return res.status(400).json({ message: "Бүх талбарыг бөглөнө үү." })
  }
  try {
    const existing = await pool.query(
      `SELECT id FROM users WHERE (email = $1 OR phone = $2) AND deleted_at IS NULL`,
      [email, phone]
    )
    if (existing.rows.length > 0) {
      return res.status(409).json({ message: "Имэйл эсвэл утасны дугаар бүртгэлтэй байна." })
    }
    const password_hash = await bcrypt.hash(password, 12)
    const { rows } = await pool.query(
      `INSERT INTO users (email, phone, password_hash, name)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, phone, name, role, is_active, created_at`,
      [email, phone, password_hash, name]
    )
    return res.status(201).json({ message: "Хэрэглэгч үүслээ.", user: rows[0] })
  } catch (err) {
    return res.status(500).json({ message: "Серверийн алдаа гарлаа." })
  }
}

// admin.controller.ts
export const updateUser = async (req: Request, res: Response) => {
  const { id } = req.params
  const { name, phone, password } = req.body

  try {
    const updates: any[] = []
    const values: any[] = []
    let idx = 1

    if (name)  { updates.push(`name = $${idx++}`);  values.push(name) }
    if (phone) { updates.push(`phone = $${idx++}`); values.push(phone) }
    if (password) {
      const hash = await bcrypt.hash(password, 12)
      updates.push(`password_hash = $${idx++}`)
      values.push(hash)
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: "Өөрчлөх зүйл байхгүй байна." })
    }

    values.push(id)
    await pool.query(
      `UPDATE users SET ${updates.join(", ")} WHERE id = $${idx} AND deleted_at IS NULL`,
      values
    )

    res.json({ message: "Амжилттай шинэчлэгдлээ." })
  } catch (err) {
    res.status(500).json({ message: "Серверийн алдаа." })
  }
}

// admin.routes.ts-д нэмнэ: