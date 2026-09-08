import { Controller, ForbiddenException, Get, HttpCode, Logger } from '@nestjs/common';
import { UserService } from '../user/user.service';
import { POService } from '../po/po.service';
import { UserRole } from '@po-control-tower/shared';

@Controller('scripts')
export class ScriptsController {
  private readonly logger = new Logger(ScriptsController.name);
  constructor(private userService: UserService, private poService: POService) {}

  @Get('seed')
  @HttpCode(200)
  async seed() {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('Seed endpoint is disabled in production');
    }
    try {
      const email = 'admin@demo.local';
      const password = 'password';
      const name = 'Demo Admin';

      let user = await this.userService.findByEmail(email);
      if (!user) {
        user = await this.userService.create({ email, password, name, roles: [UserRole.ADMIN, UserRole.SCM] });
        this.logger.log(`Created demo user: ${email}`);
      }

      const createReq = {
        poNumber: `PO-${Date.now()}`,
        poDate: new Date().toISOString(),
        poExpiryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        channelId: 'DemoChannel',
        customerId: 'DemoCustomer',
        location: 'DemoWarehouse',
        poValue: 10000,
        lineItems: [
          { skuCode: 'SKU-001', skuName: 'Sample Item A', quantity: 10 },
          { skuCode: 'SKU-002', skuName: 'Sample Item B', quantity: 5 },
        ],
      } as any;

      await this.poService.createPO(createReq, user.id);
      this.logger.log('Created sample PO');
      return { success: true };
    } catch (err) {
      this.logger.error('Seed failed', err as any);
      return { success: false, error: err };
    }
  }
}
