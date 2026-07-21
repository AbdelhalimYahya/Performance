/**
 * METRICS CONTROLLER — Prometheus Scraper Endpoint
 *
 * GET /metrics returns all registered metrics in Prometheus text format.
 * Content-Type must be text/plain; version=0.0.4 (Prometheus requirement).
 *
 * This endpoint must be excluded from auth middleware — Prometheus
 * needs unauthenticated access to scrape metrics.
 */

import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';
import { register } from 'prom-client';

@Controller()
export class MetricsController {
  @Get('metrics')
  async getMetrics(@Res() res: Response) {
    try {
      const metrics = await register.metrics();
      res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
      res.send(metrics);
    } catch (error) {
      res.status(500).send('Error collecting metrics');
    }
  }

  @Get('metrics/json')
  async getMetricsJson(@Res() res: Response) {
    try {
      const metrics = await register.getSingleMetricAsString();
      res.json({ raw: metrics });
    } catch (error) {
      res.status(500).json({ error: 'Error collecting metrics' });
    }
  }
}
