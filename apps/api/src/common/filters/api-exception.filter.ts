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
import type { ApiErrorResponse } from "@tripforge/contracts";

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
        : (this.normalizeParserException(exception, path) ??
          this.normalizeUnexpectedException(exception, path));

    httpAdapter.reply(response, errorResponse, errorResponse.statusCode);
  }

  private normalizeHttpException(
    exception: HttpException,
    path: string,
  ): ApiErrorResponse {
    const statusCode = exception.getStatus();
    const response = exception.getResponse();
    const responseCode =
      typeof response === "object" &&
      response !== null &&
      "code" in response &&
      typeof response.code === "string"
        ? response.code
        : undefined;
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
    const isInvalidJson =
      statusCode === HttpStatus.BAD_REQUEST &&
      typeof responseMessage === "string" &&
      /json|unexpected token|expected property|unterminated/iu.test(
        responseMessage,
      );

    return {
      statusCode,
      code: isInvalidJson
        ? "INVALID_JSON"
        : isValidationError
        ? "VALIDATION_ERROR"
        : (responseCode ?? this.getHttpStatusCode(statusCode)),
      message: isInvalidJson
        ? "Request body must contain valid JSON"
        : isValidationError
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
      `Unhandled exception type=${
        exception instanceof Error ? exception.name : "unknown"
      }`,
    );

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: "INTERNAL_SERVER_ERROR",
      message: "Internal server error",
      path,
      timestamp: new Date().toISOString(),
    };
  }

  private normalizeParserException(
    exception: unknown,
    path: string,
  ): ApiErrorResponse | undefined {
    if (!exception || typeof exception !== "object") return undefined;
    const candidate = exception as { status?: unknown; type?: unknown };
    if (candidate.status === HttpStatus.PAYLOAD_TOO_LARGE) {
      return {
        statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
        code: "PAYLOAD_TOO_LARGE",
        message: "Request body is too large",
        path,
        timestamp: new Date().toISOString(),
      };
    }
    if (
      candidate.status === HttpStatus.BAD_REQUEST &&
      candidate.type === "entity.parse.failed"
    ) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        code: "INVALID_JSON",
        message: "Request body must contain valid JSON",
        path,
        timestamp: new Date().toISOString(),
      };
    }
    return undefined;
  }

  private getHttpStatusCode(statusCode: number): string {
    const code = HttpStatus[statusCode];

    return typeof code === "string" ? code : "HTTP_ERROR";
  }
}
