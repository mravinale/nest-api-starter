import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/api/hello (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/hello')
      .expect(200)
      .expect('Hello World!');
  });

  /**
   * PR#6 - Health check endpoint (e2e)
   */
  describe('/health (GET)', () => {
    it('should return 200 with status ok', () => {
      return request(app.getHttpServer())
        .get('/health')
        .expect(200)
        .expect((res) => {
          expect(res.body.status).toBe('ok');
          expect(res.body.timestamp).toBeDefined();
          expect(res.body.uptime).toBeDefined();
          expect(typeof res.body.uptime).toBe('number');
        });
    });
  });
});
