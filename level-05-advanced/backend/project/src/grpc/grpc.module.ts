import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import * as path from 'path';
import { ProductGrpcController } from './product.grpc.controller';
import { RestEquivalentController } from './rest-equivalent.controller';
import { GrpcClientService } from './grpc-client.service';

/**
 * gRPC MODULE
 *
 * Configures the gRPC microservice transport.
 * Proto file defines the service contract — auto-generates client stubs.
 *
 * URL: 0.0.0.0:50051
 * - 0.0.0.0: listen on all interfaces (required for Docker/k8s)
 * - 50051: standard gRPC port
 *
 * In production:
 * - Use TLS for encrypted transport
 * - Add load balancing (round-robin, pick_first)
 * - Configure keepalive to detect dead connections
 */
@Module({
  imports: [
    ClientsModule.register([
      {
        name: 'PRODUCT_SERVICE',
        transport: Transport.GRPC,
        options: {
          package: 'products',
          protoPath: path.join(__dirname, '../../protos/product.proto'),
          url: process.env.GRPC_URL || '0.0.0.0:50051',
        },
      },
    ]),
  ],
  controllers: [ProductGrpcController, RestEquivalentController],
  providers: [GrpcClientService],
  exports: [GrpcClientService],
})
export class GrpcModule {}
