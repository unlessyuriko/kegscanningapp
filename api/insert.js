const sql        = require('mssql');
const { ClientSecretCredential } = require('@azure/identity');

const credential = new ClientSecretCredential(
  process.env.AZURE_TENANT_ID,
  process.env.AZURE_CLIENT_ID,
  process.env.AZURE_CLIENT_SECRET
);

// Cache pool + token expiry so warm invocations skip reconnect
let pool        = null;
let tokenExpiry = 0;

async function getPool() {
  const now = Date.now();

  // Refresh if token expires within 5 minutes
  if (pool && tokenExpiry - now > 5 * 60 * 1000) return pool;

  // Close stale pool if any
  if (pool) { try { await pool.close(); } catch (_) {} pool = null; }

  const tokenRes = await credential.getToken('https://database.windows.net/.default');
  tokenExpiry = tokenRes.expiresOnTimestamp;

  pool = await new sql.ConnectionPool({
    server:   process.env.SYNAPSE_SERVER,
    port:     1433,
    database: process.env.SYNAPSE_DB,
    options: {
      encrypt:                true,
      trustServerCertificate: true,
      enableArithAbort:       true,
      connectTimeout:         30000,
      requestTimeout:         30000,
    },
    authentication: {
      type:    'azure-active-directory-access-token',
      options: { token: tokenRes.token },
    },
    pool: { max: 3, min: 0, idleTimeoutMillis: 30000 },
  }).connect();

  return pool;
}

module.exports = async function handler(req, res) {
  const origin = process.env.CORS_ORIGIN || 'https://unlessyuriko.github.io';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  const { session, kegs, submittedBy, batchId } = req.body || {};

  if (!session || !Array.isArray(kegs) || kegs.length === 0) {
    return res.status(400).json({ error: 'session and kegs[] are required' });
  }

  const rpmType = ((session.type || 'keg')[0].toUpperCase() + (session.type || 'keg').slice(1)).slice(0, 10);
  const now     = new Date();
  const by      = (submittedBy || 'KegScanApp').slice(0, 100);

  try {
    const db = await getPool();

    for (const [idx, keg] of kegs.entries()) {
      await db.request()
        .input('ScanId',         sql.BigInt,       idx + 1)
        .input('LotNumber',      sql.VarChar(50),  (keg.lotNumber  || '').slice(0, 50)  || null)
        .input('BestBeforeDate', sql.Date,         keg.bestBefore  ? new Date(keg.bestBefore) : null)
        .input('Brand',          sql.VarChar(100), (keg.brand      || '').slice(0, 100) || null)
        .input('ScanTime',       sql.DateTime2,    keg.timestamp   ? new Date(keg.timestamp)  : now)
        .input('CreatedBy',      sql.VarChar(100), by)
        .input('CreatedDate',    sql.DateTime2,    now)
        .input('ModifiedDate',   sql.DateTime2,    now)
        .input('SourceSystem',   sql.VarChar(50),  'KegScannerApp')
        .input('BatchId',        sql.VarChar(100), (batchId        || '').slice(0, 100) || null)
        .input('rpm_type',       sql.VarChar(10),  rpmType)
        .input('truck_number',   sql.NVarChar(10), (session.truckNumber || '').slice(0, 10) || null)
        .input('uom',            sql.NVarChar(10), (session.kegSize     || '').slice(0, 10) || null)
        .query(`
          INSERT INTO [stg].[KegScanRaw]
            ([ScanId],[LotNumber],[BestBeforeDate],[Brand],[ScanTime],
             [CreatedBy],[CreatedDate],[ModifiedDate],[SourceSystem],
             [BatchId],[rpm_type],[truck_number],[uom])
          VALUES
            (@ScanId,@LotNumber,@BestBeforeDate,@Brand,@ScanTime,
             @CreatedBy,@CreatedDate,@ModifiedDate,@SourceSystem,
             @BatchId,@rpm_type,@truck_number,@uom)
        `);
    }

    return res.status(200).json({ ok: true, inserted: kegs.length });

  } catch (err) {
    console.error('Synapse insert error:', err.message, err.code);
    pool = null; tokenExpiry = 0; // reset on error so next call reconnects
    return res.status(500).json({ error: err.message, code: err.code });
  }
};
