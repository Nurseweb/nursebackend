import { Pool } from "pg";
import dotenv from "dotenv";
import bcrypt from "bcryptjs"; // ← ЭНИ НЭМНЭ
dotenv.config();
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export async function initDB() {
  const client = await pool.connect();
  try {
    // Super admin table
    await client.query(`
      CREATE TABLE IF NOT EXISTS admins (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email         VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        name          VARCHAR(100) NOT NULL DEFAULT 'Super Admin',
        role          VARCHAR(20) NOT NULL DEFAULT 'admin',
        is_active     BOOLEAN NOT NULL DEFAULT true,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at    TIMESTAMPTZ
      );
    `);

    // Users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email         VARCHAR(255) UNIQUE NOT NULL,
        phone         VARCHAR(20) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        name          VARCHAR(100) NOT NULL,
        role          VARCHAR(20) NOT NULL DEFAULT 'user',
        is_active     BOOLEAN NOT NULL DEFAULT true,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at    TIMESTAMPTZ
      );
    `);

    // Auto-update updated_at trigger
    await client.query(`
      CREATE OR REPLACE FUNCTION update_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'users_updated_at') THEN
          CREATE TRIGGER users_updated_at
            BEFORE UPDATE ON users
            FOR EACH ROW EXECUTE FUNCTION update_updated_at();
        END IF;
      END $$;
    `);

    // Seed super admin if not exists
    const { rows } = await client.query(
      `SELECT id FROM admins WHERE email = $1`,
      [process.env.ADMIN_EMAIL],
    );

    if (rows.length === 0) {
      const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD!, 12);
      console.log("Seeding admin:", process.env.ADMIN_EMAIL);
      console.log("Hash:", hash);
      await client.query(
        `INSERT INTO admins (email, password_hash, name, role)
     VALUES ($1, $2, 'Super Admin', 'admin')`,
        [process.env.ADMIN_EMAIL, hash],
      );
      console.log("✅ Super admin үүслээ");
    } else {
      console.log("Admin аль хэдийн байна:", rows[0]);
    }

    console.log("✅ Database холболт амжилттай");
  } finally {
    client.release();
  }
}
