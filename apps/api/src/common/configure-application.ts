import {
  type INestApplication,
  RequestMethod,
  ValidationPipe,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import cookieParser from "cookie-parser";

type CorsOriginCallback = (error: Error | null, allow?: boolean) => void;

export function configureApplication(app: INestApplication): void {
  const webOrigin = app.get(ConfigService).getOrThrow<string>("WEB_ORIGIN");

  app.enableCors({
    allowedHeaders: ["Content-Type", "X-TripForge-Request"],
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    origin: (
      requestOrigin: string | undefined,
      callback: CorsOriginCallback,
    ) => {
      callback(null, requestOrigin === undefined || requestOrigin === webOrigin);
    },
  });
  app.use(cookieParser());

  app.setGlobalPrefix("api", {
    exclude: [{ path: "health", method: RequestMethod.GET }],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    }),
  );
}
