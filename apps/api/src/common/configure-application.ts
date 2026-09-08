import { type INestApplication, RequestMethod, ValidationPipe } from "@nestjs/common";

export function configureApplication(app: INestApplication): void {
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
