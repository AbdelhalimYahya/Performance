/**
 * RUM PROVIDER — React Integration for Real User Monitoring
 *
 * "use client" component that initializes RUM on mount and starts
 * extended observers. Wraps children and renders nothing itself.
 *
 * Configuration comes from environment variables:
 * - NEXT_PUBLIC_RUM_ENDPOINT: API endpoint for metric collection
 * - NEXT_PUBLIC_RUM_SAMPLE_RATE: Percentage of sessions to report (0-1)
 */

'use client';

import { useEffect, ReactNode } from 'react';
import { initRUM, stopRUM } from '@/lib/rum';
import { startAllObservers, stopAllObservers } from '@/lib/rum-observer';

interface RumProviderProps {
  children: ReactNode;
}

export function RumProvider({ children }: RumProviderProps) {
  useEffect(() => {
    // Read config from environment variables
    const endpoint = process.env.NEXT_PUBLIC_RUM_ENDPOINT || '/api/rum';
    const sampleRate = parseFloat(process.env.NEXT_PUBLIC_RUM_SAMPLE_RATE || '0.1');
    const appVersion = process.env.NEXT_PUBLIC_APP_VERSION || 'unknown';
    const environment = process.env.NODE_ENV || 'development';

    // Initialize RUM with web-vitals callbacks
    initRUM({
      endpoint,
      sampleRate: isNaN(sampleRate) ? 0.1 : sampleRate,
      debug: environment === 'development',
      appVersion,
      environment,
    });

    // Start extended observers for long tasks, resources, navigation, layout shifts
    startAllObservers();

    return () => {
      stopRUM();
      stopAllObservers();
    };
  }, []);

  return <>{children}</>;
}
