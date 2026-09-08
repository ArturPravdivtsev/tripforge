import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";

type ApiErrorResponse = {
  statusCode: number;
  code: string;
  message: string;
  path: string;
  timestamp: string;
  errors?: string[];
};

@Catch()
@Injectable()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  constructor(private readonly adapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.adapterHost;
    const httpContext = host.switchToHttp();
    const request = httpContext.getRequest<unknown>();
    const response = httpContext.getResponse<unknown>();
    const path = httpAdapter.getRequestUrl(request);

    const errorResponse =
      exception instanceof HttpException
        ? this.normalizeHttpException(exception, path)
        : this.normalizeUnexpectedException(exception, path);

    httpAdapter.reply(response, errorResponse, errorResponse.statusCode);
  }

  private normalizeHttpException(
    exception: HttpException,
    path: string,
  ): ApiErrorResponse {
    const statusCode = exception.getStatus();
    const response = exception.getResponse();
    const responseMessage =
      typeof response === "string"
        ? response
        : "message" in response
          ? response.message
          : undefined;
    const errors = Array.isArray(responseMessage)
      ? responseMessage.filter(
          (message): message is string => typeof message === "string",
        )
      : undefined;
    const isValidationError =
      statusCode === HttpStatus.BAD_REQUEST && Boolean(errors?.length);

    return {
      statusCode,
      code: isValidationError
        ? "VALIDATION_ERROR"
        : this.getHttpStatusCode(statusCode),
      message: isValidationError
        ? "Validation failed"
        : typeof responseMessage === "string"
          ? responseMessage
          : "Request failed",
      path,
      timestamp: new Date().toISOString(),
      ...(errors?.length ? { errors } : {}),
    };
  }

  private normalizeUnexpectedException(
    exception: unknown,
    path: string,
  ): ApiErrorResponse {
    this.logger.error(
      "Unhandled exception",
      exception instanceof Error ? exception.stack : undefined,
    );

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: "INTERNAL_SERVER_ERROR",
      message: "Internal server error",
      path,
      timestamp: new Date().toISOString(),
    };
  }

  private getHttpStatusCode(statusCode: number): string {
    const code = HttpStatus[statusCode];

    return typeof code === "string" ? code : "HTTP_ERROR";
  }
}
