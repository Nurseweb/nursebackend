import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool } from "../config/db.js";

// POST /api/auth/register
export async function register(req: Request, res: Response) {
  const { email, phone, password, name } = req.body;

  if (!email || !phone || !password || !name) {
    return res.status(400).json({ message: "Бүх талбарыг бөглөнө үү." });
  }

  try {
    // Check duplicate
    const existing = await pool.query(
      `SELECT id FROM users WHERE (email = $1 OR phone = $2) AND deleted_at IS NULL`,
      [email, phone],
    );
    if (existing.rows.length > 0) {
      return res
        .status(409)
        .json({ message: "Имэйл эсвэл утасны дугаар бүртгэлтэй байна." });
    }

    const password_hash = await bcrypt.hash(password, 12);

    const { rows } = await pool.query(
      `INSERT INTO users (email, phone, password_hash, name)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, phone, name, role, is_active, created_at`,
      [email, phone, password_hash, name],
    );

    return res.status(201).json({
      message: "Бүртгэл амжилттай.",
      user: rows[0],
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Серверийн алдаа гарлаа." });
  }
}

// POST /api/auth/login
export async function login(req: Request, res: Response) {
  const { email, password } = req.body;
  console.log("Login attempt:", email, password);
  if (!email || !password) {
    return res
      .status(400)
      .json({ message: "Имэйл болон нууц үгээ оруулна уу." });
  }

  try {
    const adminResult = await pool.query(
      `SELECT * FROM admins WHERE email = $1 AND deleted_at IS NULL`,
      [email],
    );
    console.log("Admin found:", adminResult.rows.length);
    if (adminResult.rows.length > 0) {
      const admin = adminResult.rows[0];
      console.log("is_active:", admin.is_active);
      console.log("hash:", admin.password_hash);

      const match = await bcrypt.compare(password, admin.password_hash);
      console.log("Password match:", match);

      if (!match) {
        return res.status(401).json({ message: "Нууц үг буруу байна." });
      }
      const token = jwt.sign(
        { id: admin.id, email: admin.email, role: "admin" },
        process.env.JWT_SECRET!,
        { expiresIn: "7d" },
      );
      return res.json({
        token,
        user: {
          id: admin.id,
          email: admin.email,
          name: admin.name,
          role: "admin",
        },
      });
    }

    // Check users
    const userResult = await pool.query(
      `SELECT * FROM users WHERE email = $1 AND deleted_at IS NULL`,
      [email],
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: "Хэрэглэгч олдсонгүй." });
    }

    const user = userResult.rows[0];
    if (!user.is_active) {
      return res
        .status(403)
        .json({
          message: "Бүртгэл идэвхгүй байна. Adminтай холбоо барина уу.",
        });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ message: "Нууц үг буруу байна." });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET!,
      { expiresIn: "7d" },
    );

    return res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone,
        role: user.role,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Серверийн алдаа гарлаа." });
  }
}
