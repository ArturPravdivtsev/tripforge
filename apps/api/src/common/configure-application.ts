import {
  type INestApplication,
  RequestMethod,
  ValidationPipe,
} from "@nestjs/common";
import cookieParser from "cookie-parser";

export function configureApplication(app: INestApplication): void {
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
