// 방문자 통계 기록 서버
// 사용법:
//   1) npm install
//   2) .env 파일에 Neon DATABASE_URL 설정 (.env.example 참고)
//   3) npm start

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // Neon은 SSL 필수
});

// 클라이언트의 실제 IP 추출 (프록시/로드밸런서 뒤에 있을 경우 x-forwarded-for 우선)
function getClientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return xff.split(',')[0].trim();
  return req.socket.remoteAddress || '';
}

// IP 기반 위치 정보 조회 (무료, 키 불필요)
async function lookupIpGeo(ip) {
  try {
    const res = await fetch(
      `http://ip-api.com/json/${ip}?fields=status,country,regionName,city,isp,lat,lon`
    );
    const data = await res.json();
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

app.post('/api/visit', async (req, res) => {
  try {
    const ip = getClientIp(req);
    const user_agent = req.headers['user-agent'] || null;
    const { language, gps_lat, gps_lon, gps_accuracy } = req.body || {};

    const geo = await lookupIpGeo(ip);

    const query = `
      INSERT INTO visits
        (ip, user_agent, language, country, region, city, isp, ip_lat, ip_lon, gps_lat, gps_lon, gps_accuracy)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id
    `;
    const values = [
      ip,
      user_agent,
      language || null,
      geo.country ?? null,
      geo.region ?? null,
      geo.city ?? null,
      geo.isp ?? null,
      geo.ip_lat ?? null,
      geo.ip_lon ?? null,
      gps_lat ?? null,
      gps_lon ?? null,
      gps_accuracy ?? null,
    ];

    const result = await pool.query(query, values);
    res.status(200).json({ success: true, id: result.rows[0].id });
  } catch (err) {
    console.error('방문 기록 저장 실패:', err);
    res.status(500).json({ success: false, message: '저장 중 오류가 발생했습니다.' });
  }
});

// 간단한 통계 조회 (최근 방문 50건)
app.get('/api/visits', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, ip, time, user_agent, language, country, region, city, isp, ip_lat, ip_lon, gps_lat, gps_lon, gps_accuracy FROM visits ORDER BY time DESC LIMIT 50'
    );
    res.json(result.rows);
  } catch (err) {
    console.error('조회 실패:', err);
    res.status(500).json({ success: false, message: '조회 중 오류가 발생했습니다.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`방문 통계 서버가 http://localhost:${PORT} 에서 실행 중입니다.`);
});
