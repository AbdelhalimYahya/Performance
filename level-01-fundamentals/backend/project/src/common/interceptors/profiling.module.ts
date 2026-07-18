import { Module, Global } from '@nestjs/common';
import { ProfilingInterceptor } from './profiling.interceptor';

/**
 * ProfilingModule provides request profiling and stats collection.
 * Use @Global() so the interceptor is available app-wide when registered.
 */
@Global()
@Module({
  providers: [ProfilingInterceptor],
  exports: [ProfilingInterceptor],
})
export class ProfilingModule {}
