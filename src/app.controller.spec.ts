import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';

describe('AppController', () => {
  let controller: AppController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
    }).compile();

    controller = module.get<AppController>(AppController);
  });

  describe('health', () => {
    it('should return health status', () => {
      const result = controller.health();
      expect(result.status).toBe('ok');
      expect(result.service).toBe('martinonoir-api');
    });
  });
});
