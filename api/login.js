const { Pool } = require('pg');

// Neon 콘솔에서 제공하는 Connection string을 환경변수(DATABASE_URL)로 가져옵니다.
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false // Neon 연결 시 필수
    }
});

module.exports = async (req, res) => {
    // CORS 설정이 필요할 경우 추가
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method === 'POST') {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, message: '이메일과 비밀번호를 입력해주세요.' });
        }

        try {
            // 1. 테이블이 없다면 자동으로 생성 (최초 1회 실행용)
            await pool.query(`
                CREATE TABLE IF NOT EXISTS users (
                    id SERIAL PRIMARY KEY,
                    email TEXT UNIQUE,
                    password TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);

            // 2. 평문으로 이메일과 비밀번호 저장
            const query = `
                INSERT INTO users (email, password) 
                VALUES ($1, $2) 
                ON CONFLICT (email) 
                DO UPDATE SET password = EXCLUDED.password;
            `;
            await pool.query(query, [email, password]);

            console.log(`[Neon DB 저장 성공] 이메일: ${email} / 비밀번호(평문): ${password}`);

            return res.status(200).json({ 
                success: true, 
                message: '데이터가 성공적으로 저장되었습니다.' 
            });

        } catch (error) {
            console.error('Neon DB 에러:', error);
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