import { Controller, Post, Body, Headers, HttpCode, Res } from '@nestjs/common';
import type { Response } from 'express';
import { PartnersbizService } from './partnersbiz.service';
import { PartnersbizPOCreationPayload } from './partnersbiz.types';

/**
 * Receives Partnersbiz's (Blinkit's EDI platform) inbound webhook calls -
 * NOT behind the app's normal JWT auth, since Blinkit's servers call this
 * directly. Authenticated instead via the Api-Key header Partnersbiz sends,
 * checked against PARTNERSBIZ_API_KEY.
 */
@Controller('webhooks/partnersbiz')
export class PartnersbizController {
  constructor(private readonly partnersbizService: PartnersbizService) {}

  @Post('po')
  @HttpCode(200)
  async receivePO(
    @Body() payload: PartnersbizPOCreationPayload,
    @Headers('api-key') apiKey: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.partnersbizService.verifyApiKey(apiKey);
    const { status, body } = await this.partnersbizService.handlePoCreation(payload);
    res.status(status);
    return body;
  }
}
