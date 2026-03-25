import { Client } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const connectionConfigs = [
  {
    name: 'Connection String',
    config: {
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    },
  },
  {
    name: 'Connection String with sslmode',
    config: {
      connectionString: `${process.env.DATABASE_URL}?sslmode=require`,
      ssl: { rejectUnauthorized: false },
    },
  },
  {
    name: 'Connection Pooler (6543)',
    config: {
      connectionString: process.env.DATABASE_URL?.replace(':5432/', ':6543/'),
      ssl: { rejectUnauthorized: false },
    },
  },
];

async function testConnection(name: string, config: any) {
  console.log(`\n🧪 Testing: ${name}`);
  console.log(`   Config: ${config.connectionString?.substring(0, 50)}...`);

  const client = new Client(config);

  try {
    await client.connect();
    const result = await client.query('SELECT NOW()');
    console.log(`   ✅ SUCCESS! Server time: ${result.rows[0].now}`);
    await client.end();
    return true;
  } catch (error: any) {
    console.log(`   ❌ FAILED: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('🔍 Testing PostgreSQL connections...\n');
  console.log(`DATABASE_URL from .env: ${process.env.DATABASE_URL?.substring(0, 50)}...`);

  for (const { name, config } of connectionConfigs) {
    await testConnection(name, config);
  }

  console.log('\n✨ Done!');
  process.exit(0);
}

main();
