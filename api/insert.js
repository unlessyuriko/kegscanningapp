const sql = require('mssql');

const config = {
  server:   process.env.SYNAPSE_SERVER,
  port:     1433,
  database: process.env.SYNAPSE_DB,
  user:     process.env.SYNAPSE_USER,
  password: process.env.SYNAPSE_PASSWORD,
  options: {
    encrypt:                true,
    trustServerCertificate: true,   // required for Synapse Dedicated SQL via tedious
    enableArithAbort:       true,
    connectTimeout:         30000,
    requestTimeout:         30000,
    cryptoCredentialsDetails: { minVersion: 'TLSv1' },
  },
  pool: {
    max: 3,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

let pool = null;
async function getPool() {
  if (pool) {
    try {
      // quick liveness check
      await pool.request().query('SELECT 1');
      return pool;
    } catch (_) {
      pool = null;
    }
  }
  pool = await new sql.ConnectionPool(config).connect();
  return pool;
}

module.exports = async function handler(req, res) {
  const origin = process.env.CORS_ORIGIN || 'https://unlessyuriko.github.io';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

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
    console.error('Synapse insert error:', err.message, err.code, err.originalError?.message);
    pool = null; // reset pool on any error
    return res.status(500).json({ error: err.message, code: err.code });
  }
};
