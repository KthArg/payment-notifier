import request from 'supertest';

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

describe('POST /api/auth/login', () => {
  it('returns 200 and a token with valid password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ password: 'admin1234' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body).toHaveProperty('expiresIn');
    expect(typeof res.body.token).toBe('string');
  });

  it('returns 401 with wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ password: 'wrongpassword' });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error', 'Unauthorized');
  });

  it('returns 400 when password is missing', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'Bad Request');
  });

  it('returns a valid JWT that can authenticate protected routes', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ password: 'admin1234' });

    const { token } = loginRes.body;

    const queueRes = await request(app)
      .get('/api/queue/stats')
      .set('Authorization', `Bearer ${token}`);

    expect(queueRes.status).not.toBe(401);
  });
});

describe('Protected routes without token', () => {
  it('GET /api/users returns 401 without token', async () => {
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(401);
  });

  it('GET /api/transactions/pending returns 401 without token', async () => {
    const res = await request(app).get('/api/transactions/pending');
    expect(res.status).toBe(401);
  });

  it('GET /api/queue/stats returns 401 without token', async () => {
    const res = await request(app).get('/api/queue/stats');
    expect(res.status).toBe(401);
  });

  it('GET /api/notifications/retryable returns 401 without token', async () => {
    const res = await request(app).get('/api/notifications/retryable');
    expect(res.status).toBe(401);
  });
});

describe('Protected routes with invalid token', () => {
  it('returns 401 with malformed token', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', 'Bearer not-a-valid-token');

    expect(res.status).toBe(401);
  });

  it('returns 401 with missing Bearer prefix', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', 'sometoken');

    expect(res.status).toBe(401);
  });
});

describe('GET /health', () => {
  it('returns 200 without authentication', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
  });
});
