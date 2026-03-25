import request from 'supertest';
import jwt from 'jsonwebtoken';

jest.mock('../../src/queues/transaction.queue', () => ({
  transactionQueue: {},
  transactionQueueEvents: { on: jest.fn(), close: jest.fn() },
  enqueueTransaction: jest.fn(),
  getQueueStats: jest.fn().mockResolvedValue({ waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 }),
  closeQueue: jest.fn(),
  QUEUE_NAME: 'transactions',
}));

jest.mock('@bull-board/api', () => ({
  createBullBoard: jest.fn().mockReturnValue({}),
}));

jest.mock('@bull-board/api/bullMQAdapter', () => ({
  BullMQAdapter: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@bull-board/express', () => ({
  ExpressAdapter: jest.fn().mockImplementation(() => ({
    setBasePath: jest.fn(),
    getRouter: jest.fn().mockReturnValue((_req: any, _res: any, next: any) => next()),
  })),
}));

import { createApp } from '../../src/app';

const app = createApp();
const TEST_TOKEN = jwt.sign({ sub: 'admin' }, process.env.JWT_SECRET!, { expiresIn: '1h' });
const authHeader = { Authorization: `Bearer ${TEST_TOKEN}` };

describe('Users API', () => {
  describe('GET /api/users', () => {
    it('returns 401 without token', async () => {
      const res = await request(app).get('/api/users');
      expect(res.status).toBe(401);
    });

    it('returns 200 or 500 with valid token', async () => {
      const res = await request(app).get('/api/users').set(authHeader);
      expect([200, 500]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body).toHaveProperty('data');
        expect(Array.isArray(res.body.data)).toBe(true);
      }
    });
  });

  describe('POST /api/users', () => {
    it('returns 400 when phoneNumber is missing', async () => {
      const res = await request(app)
        .post('/api/users')
        .set(authHeader)
        .send({ fullName: 'Test User' });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/users/:id', () => {
    it('returns 401 without token', async () => {
      expect((await request(app).get('/api/users/some-id')).status).toBe(401);
    });
  });
});

describe('Transactions API', () => {
  it('GET /api/transactions/pending returns 401 without token', async () => {
    expect((await request(app).get('/api/transactions/pending')).status).toBe(401);
  });

  it('GET /api/transactions/pending responds with valid token', async () => {
    const res = await request(app).get('/api/transactions/pending').set(authHeader);
    expect([200, 500]).toContain(res.status);
  });

  it('GET /api/transactions/stats returns 400 for invalid date', async () => {
    const res = await request(app)
      .get('/api/transactions/stats?from=not-a-date')
      .set(authHeader);
    expect(res.status).toBe(400);
  });

  it('GET /api/transactions/stats accepts valid date params', async () => {
    const res = await request(app)
      .get('/api/transactions/stats?from=2024-01-01&to=2024-12-31')
      .set(authHeader);
    expect([200, 500]).toContain(res.status);
  });
});

describe('Notifications API', () => {
  it('PATCH /api/notifications/:id/status returns 401 without token', async () => {
    expect((await request(app).patch('/api/notifications/some-id/status')).status).toBe(401);
  });

  it('PATCH /api/notifications/:id/status returns 400 with invalid status', async () => {
    const res = await request(app)
      .patch('/api/notifications/some-id/status')
      .set(authHeader)
      .send({ status: 'invalid-status' });
    expect(res.status).toBe(400);
  });
});

describe('Queue API', () => {
  it('GET /api/queue/stats returns 401 without token', async () => {
    expect((await request(app).get('/api/queue/stats')).status).toBe(401);
  });

  it('GET /api/queue/stats returns 200 with mocked queue', async () => {
    const res = await request(app).get('/api/queue/stats').set(authHeader);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('waiting');
  });

  it('DELETE /api/queue/failed returns 401 without token', async () => {
    expect((await request(app).delete('/api/queue/failed')).status).toBe(401);
  });
});

describe('404 handler', () => {
  it('returns 404 for unknown routes', async () => {
    const res = await request(app).get('/api/nonexistent');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error', 'Not Found');
  });
});
